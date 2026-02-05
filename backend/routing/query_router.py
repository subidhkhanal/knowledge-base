from dataclasses import dataclass
from typing import Optional, Tuple
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


CLASSIFICATION_PROMPT = """You are a query classifier for a personal knowledge base assistant. Classify the user's query into ONE of these categories:

KNOWLEDGE - Questions seeking specific information from documents (facts, details, explanations, "what is", "how does", "explain X", etc.)
SUMMARY - Requests to summarize documents or topics ("summarize", "main points", "key takeaways", "tldr", "overview of")
COMPARISON - Requests to compare two or more things ("compare X and Y", "difference between", "X vs Y", "how is X different from Y")
FOLLOW_UP - Follow-up questions referencing previous context ("tell me more about that", "what about the other one", "and the second point?")
META - Questions about the system itself, what documents exist, or capabilities ("what documents do I have", "list my files", "what can you do")
GREETING - Greetings, thanks, small talk ("hello", "hi", "thanks", "bye", "how are you")
CLARIFICATION - Query is too vague or ambiguous (single words like "details", "more", or unclear references without context)
OUT_OF_SCOPE - Requests outside capabilities (writing code, sending emails, browsing web, calculations)

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

    async def classify(self, query: str) -> RouteResult:
        """
        Classify a query into a route type.

        Uses keyword pre-filter first for speed, falls back to LLM for complex cases.

        Args:
            query: The user's query string

        Returns:
            RouteResult with the classified route type
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

        # Fall back to LLM for complex/ambiguous queries
        if not self.groq_client:
            # No API key, default to KNOWLEDGE route
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
                temperature=0.1,  # Low temperature for consistent classification
                max_tokens=20     # We only need a single word response
            )

            llm_response = response.choices[0].message.content
            route_type = self._parse_response(llm_response)

            return RouteResult(
                route_type=route_type,
                confidence=1.0,
                reasoning=f"LLM classified as: {llm_response}"
            )

        except Exception as e:
            # On error, default to KNOWLEDGE route (full RAG pipeline)
            return RouteResult(
                route_type=RouteType.KNOWLEDGE,
                confidence=0.5,
                reasoning=f"Classification error: {str(e)}, defaulting to KNOWLEDGE"
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
