from dataclasses import dataclass, field
from typing import Optional, Tuple, List, Dict
from enum import Enum
import re
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL


class RouteType(str, Enum):
    """Types of query routes."""
    KNOWLEDGE = "KNOWLEDGE"      # Questions about document content
    META = "META"                # Questions about the system/documents
    GREETING = "GREETING"        # Greetings, small talk
    CLARIFICATION = "CLARIFICATION"  # Vague/unclear queries
    OUT_OF_SCOPE = "OUT_OF_SCOPE"    # Requests outside capabilities
    SUMMARY = "SUMMARY"          # Summarize a document or topic
    COMPARISON = "COMPARISON"    # Compare two or more things
    FOLLOW_UP = "FOLLOW_UP"      # Follow-up on previous conversation


# Keyword patterns for fast pre-filtering (avoids LLM call)
GREETING_PATTERNS = [
    r"^(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening))(\s+there)?[\s!?.]*$",
    r"^(thanks|thank\s*you|thx|ty)[\s!?.]*$",
    r"^(bye|goodbye|see\s*you|later)[\s!?.]*$",
    r"^(how\s*are\s*you|what'?s\s*up|sup)[\s!?.]*$",
]

META_PATTERNS = [
    r"(what|which|list|show|display).*(documents?|files?|sources?).*(have|uploaded|available|stored)",
    r"(what|how\s*many).*(documents?|files?).*(do\s*i|i)\s*have",
    r"^(list|show)\s*(my\s*)?(documents?|files?|sources?)[\s!?.]*$",
    r"what\s*(can|do)\s*you\s*(do|know|have)",
    r"(your|the)\s*capabilities",
]

SUMMARY_PATTERNS = [
    r"^summarize\s+",
    r"^(give|provide|create)\s*(me\s*)?(a\s*)?summary",
    r"^(what\s*is\s*the\s*)?(main|key)\s*(points?|ideas?|takeaways?)",
    r"^tldr\s*",
    r"summarize\s*(this|the|that)",
]

COMPARISON_PATTERNS = [
    r"compare\s+.+\s+(and|with|to|vs\.?)\s+",
    r"(difference|differences)\s*(between|of)",
    r"(how|what).*(different|similar|compare)",
    r".+\s+vs\.?\s+.+",
]

CLARIFICATION_PATTERNS = [
    r"^(more|details?|explain|elaborate|continue)[\s!?.]*$",
    r"^(yes|no|ok|okay|sure|yep|nope)[\s!?.]*$",
    r"^(what|huh|hmm)[\s!?.]*$",
]


@dataclass
class RouteResult:
    """Result of query classification."""
    route_type: RouteType
    confidence: float = 1.0
    reasoning: Optional[str] = None
    rewritten_query: Optional[str] = None


REWRITE_PROMPT = """Given this conversation history and the user's latest query, rewrite the query to be self-contained by:
1. Resolving any references like "that", "it", "this document", "the file", etc.
2. Fixing any spelling mistakes or typos

If the query is already self-contained and has no typos, return it as-is. Do NOT add extra information or change the intent.

Chat History:
{history}

Latest Query: "{query}"

Rewritten Query:"""


CLASSIFY_AND_CORRECT_PROMPT = """You are a query classifier for a personal knowledge base assistant.

1. Fix any spelling mistakes or typos in the query
2. Classify it into ONE category: KNOWLEDGE, SUMMARY, COMPARISON, FOLLOW_UP, META, GREETING, CLARIFICATION, OUT_OF_SCOPE

Respond in this EXACT format (category | corrected query):
CATEGORY | corrected query

Examples:
- "explain the concpt on the boks" → KNOWLEDGE | explain the concept on the books
- "summarize the main topcs" → SUMMARY | summarize the main topics
- "hello" → GREETING | hello
- "what documets do i have" → META | what documents do i have
- "what is brahmacharya" → KNOWLEDGE | what is brahmacharya
- "explain each document in detail" → META | explain each document in detail
- "tell me about all my books" → META | tell me about all my books
- "what does every document talk about" → META | what does every document talk about

Categories:
KNOWLEDGE - Questions seeking information from documents
SUMMARY - Requests to summarize documents or topics
COMPARISON - Compare two or more things
FOLLOW_UP - References previous context
META - Questions about the system, what documents exist, document overviews, or capabilities. Includes queries about "each/all/every document" or asking what the collection contains.
GREETING - Greetings, small talk
CLARIFICATION - Too vague or ambiguous
OUT_OF_SCOPE - Outside capabilities (code, emails, web, calculations)

Query: "{query}"
"""


CLASSIFICATION_PROMPT = """You are a query classifier for a personal knowledge base assistant. Classify the user's query into ONE of these categories:

KNOWLEDGE - Questions seeking specific information from documents
SUMMARY - Requests to summarize documents or topics
COMPARISON - Compare two or more things
FOLLOW_UP - Follow-up questions referencing previous context
META - Questions about the system itself, what documents exist, or capabilities
GREETING - Greetings, thanks, small talk
CLARIFICATION - Query is too vague or ambiguous
OUT_OF_SCOPE - Requests outside capabilities

User Query: "{query}"

Respond with ONLY the category name, nothing else."""


class QueryRouter:
    """Routes queries to appropriate handlers using LLM classification."""

    def __init__(self):
        self.groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
        self.model = GROQ_MODEL

        # Compile regex patterns for faster matching
        self._greeting_re = [re.compile(p, re.IGNORECASE) for p in GREETING_PATTERNS]
        self._meta_re = [re.compile(p, re.IGNORECASE) for p in META_PATTERNS]
        self._summary_re = [re.compile(p, re.IGNORECASE) for p in SUMMARY_PATTERNS]
        self._comparison_re = [re.compile(p, re.IGNORECASE) for p in COMPARISON_PATTERNS]
        self._clarification_re = [re.compile(p, re.IGNORECASE) for p in CLARIFICATION_PATTERNS]

    def _keyword_prefilter(self, query: str) -> Optional[Tuple[RouteType, str]]:
        """
        Fast keyword-based routing for obvious cases.
        Returns (RouteType, reasoning) if matched, None otherwise.
        """
        query_clean = query.strip()

        # Check greeting patterns
        for pattern in self._greeting_re:
            if pattern.search(query_clean):
                return (RouteType.GREETING, "Keyword match: greeting pattern")

        # Check meta patterns
        for pattern in self._meta_re:
            if pattern.search(query_clean):
                return (RouteType.META, "Keyword match: meta/system query")

        # Check summary patterns
        for pattern in self._summary_re:
            if pattern.search(query_clean):
                return (RouteType.SUMMARY, "Keyword match: summary request")

        # Check comparison patterns
        for pattern in self._comparison_re:
            if pattern.search(query_clean):
                return (RouteType.COMPARISON, "Keyword match: comparison request")

        # Check clarification patterns (very short/vague queries)
        if len(query_clean.split()) <= 2:
            for pattern in self._clarification_re:
                if pattern.search(query_clean):
                    return (RouteType.CLARIFICATION, "Keyword match: vague/unclear query")

        return None

    def _format_history(self, chat_history: List[Dict[str, str]]) -> str:
        """Format chat history into a readable string."""
        lines = []
        for msg in chat_history:
            role = msg.get("role", "user").capitalize()
            content = msg.get("content", "")
            # Truncate long messages to save tokens
            if len(content) > 500:
                content = content[:500] + "..."
            lines.append(f"{role}: {content}")
        return "\n".join(lines)

    def _rewrite_query(self, query: str, chat_history: List[Dict[str, str]]) -> Optional[str]:
        """
        Rewrite a query using chat history to resolve references.
        Returns the rewritten query, or None if rewrite fails.
        """
        if not self.groq_client or not chat_history:
            return None

        history_str = self._format_history(chat_history)
        prompt = REWRITE_PROMPT.format(history=history_str, query=query)

        try:
            response = self.groq_client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=150
            )
            rewritten = response.choices[0].message.content.strip()
            # Only use rewrite if it's meaningfully different
            if rewritten and rewritten.lower() != query.lower():
                return rewritten
            return None
        except Exception:
            return None

    def _classify_and_correct(self, query: str) -> Tuple[RouteType, Optional[str]]:
        """
        Classify query AND fix typos in a single LLM call.
        Returns (route_type, corrected_query_or_None).
        """
        if not self.groq_client:
            return (RouteType.KNOWLEDGE, None)

        prompt = CLASSIFY_AND_CORRECT_PROMPT.format(query=query)

        try:
            response = self.groq_client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=150
            )
            raw = response.choices[0].message.content.strip()

            # Parse "CATEGORY | corrected query" format
            if "|" in raw:
                parts = raw.split("|", 1)
                category = parts[0].strip().upper()
                corrected = parts[1].strip()
                # Strip wrapping quotes if present
                corrected = corrected.strip('"\'')
            else:
                # Fallback: treat entire response as category
                category = raw.upper()
                corrected = None

            route_type = self._parse_response(category)

            # Only return corrected query if it's meaningfully different
            if corrected and corrected.lower() != query.lower():
                return (route_type, corrected)
            return (route_type, None)

        except Exception:
            return (RouteType.KNOWLEDGE, None)

    def _build_prompt(self, query: str) -> str:
        """Build the classification prompt."""
        return CLASSIFICATION_PROMPT.format(query=query)

    def _parse_response(self, response: str) -> RouteType:
        """Parse the LLM response into a RouteType."""
        response = response.strip().upper()

        # Map response to RouteType
        route_map = {
            "KNOWLEDGE": RouteType.KNOWLEDGE,
            "META": RouteType.META,
            "GREETING": RouteType.GREETING,
            "CLARIFICATION": RouteType.CLARIFICATION,
            "OUT_OF_SCOPE": RouteType.OUT_OF_SCOPE,
            "SUMMARY": RouteType.SUMMARY,
            "COMPARISON": RouteType.COMPARISON,
            "FOLLOW_UP": RouteType.FOLLOW_UP,
        }

        # Try exact match first
        if response in route_map:
            return route_map[response]

        # Try partial match (in case LLM adds extra text)
        for key, route_type in route_map.items():
            if key in response:
                return route_type

        # Default to KNOWLEDGE if unclear
        return RouteType.KNOWLEDGE

    async def classify(self, query: str, chat_history: Optional[List[Dict[str, str]]] = None) -> RouteResult:
        """
        Classify a query into a route type.

        Uses keyword pre-filter first for speed, falls back to LLM for complex cases.
        When chat_history is provided, rewrites referential queries before classification.

        Args:
            query: The user's query string
            chat_history: Optional list of previous messages for context

        Returns:
            RouteResult with the classified route type and optional rewritten_query
        """
        # Try fast keyword pre-filter first
        prefilter_result = self._keyword_prefilter(query)
        if prefilter_result:
            route_type, reasoning = prefilter_result
            return RouteResult(
                route_type=route_type,
                confidence=0.9,
                reasoning=reasoning
            )

        # No chat history: single LLM call for classify + correct
        if not chat_history:
            route_type, corrected = self._classify_and_correct(query)
            return RouteResult(
                route_type=route_type,
                confidence=1.0 if self.groq_client else 0.5,
                reasoning="Combined classify+correct",
                rewritten_query=corrected
            )

        # With chat history: rewrite first (resolves refs + typos), then classify
        rewritten_query = self._rewrite_query(query, chat_history)
        classify_query = rewritten_query or query

        if not self.groq_client:
            return RouteResult(
                route_type=RouteType.KNOWLEDGE,
                confidence=0.5,
                reasoning="No Groq API key available, defaulting to KNOWLEDGE",
                rewritten_query=rewritten_query
            )

        prompt = self._build_prompt(classify_query)

        try:
            response = self.groq_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=20
            )

            llm_response = response.choices[0].message.content
            route_type = self._parse_response(llm_response)

            return RouteResult(
                route_type=route_type,
                confidence=1.0,
                reasoning=f"LLM classified as: {llm_response}",
                rewritten_query=rewritten_query
            )

        except Exception as e:
            return RouteResult(
                route_type=RouteType.KNOWLEDGE,
                confidence=0.5,
                reasoning=f"Classification error: {str(e)}, defaulting to KNOWLEDGE",
                rewritten_query=rewritten_query
            )

    def classify_sync(self, query: str) -> RouteResult:
        """Synchronous version of classify."""
        # Try fast keyword pre-filter first
        prefilter_result = self._keyword_prefilter(query)
        if prefilter_result:
            route_type, reasoning = prefilter_result
            return RouteResult(
                route_type=route_type,
                confidence=0.9,
                reasoning=reasoning
            )

        # Fall back to LLM
        if not self.groq_client:
            return RouteResult(
                route_type=RouteType.KNOWLEDGE,
                confidence=0.5,
                reasoning="No Groq API key available, defaulting to KNOWLEDGE"
            )

        prompt = self._build_prompt(query)

        try:
            response = self.groq_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=20
            )

            llm_response = response.choices[0].message.content
            route_type = self._parse_response(llm_response)

            return RouteResult(
                route_type=route_type,
                confidence=1.0,
                reasoning=f"LLM classified as: {llm_response}"
            )

        except Exception as e:
            return RouteResult(
                route_type=RouteType.KNOWLEDGE,
                confidence=0.5,
                reasoning=f"Classification error: {str(e)}, defaulting to KNOWLEDGE"
            )
