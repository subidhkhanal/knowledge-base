from dataclasses import dataclass
from typing import Optional
from enum import Enum
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL


class RouteType(str, Enum):
    """Types of query routes."""
    KNOWLEDGE = "KNOWLEDGE"      # Questions about document content
    META = "META"                # Questions about the system/documents
    GREETING = "GREETING"        # Greetings, small talk
    CLARIFICATION = "CLARIFICATION"  # Vague/unclear queries
    OUT_OF_SCOPE = "OUT_OF_SCOPE"    # Requests outside capabilities


@dataclass
class RouteResult:
    """Result of query classification."""
    route_type: RouteType
    confidence: float = 1.0
    reasoning: Optional[str] = None


CLASSIFICATION_PROMPT = """You are a query classifier for a personal knowledge base assistant. Classify the user's query into ONE of these categories:

KNOWLEDGE - Questions seeking information that would be found in documents (facts, details, explanations, "what is", "how does", "explain", etc.)
META - Questions about the system itself, what documents exist, capabilities, or how the assistant works ("what documents", "what do you have", "list my files", "what can you do")
GREETING - Greetings, thanks, small talk, casual conversation ("hello", "hi", "thanks", "bye", "how are you")
CLARIFICATION - Query is too vague or ambiguous to process meaningfully (single words like "details", "more", "explain", or unclear references)
OUT_OF_SCOPE - Requests for actions outside capabilities like writing code, sending emails, browsing web, calculations, or tasks unrelated to the knowledge base

User Query: "{query}"

Respond with ONLY the category name (KNOWLEDGE, META, GREETING, CLARIFICATION, or OUT_OF_SCOPE), nothing else."""


class QueryRouter:
    """Routes queries to appropriate handlers using LLM classification."""

    def __init__(self):
        self.groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
        self.model = GROQ_MODEL

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

        Args:
            query: The user's query string

        Returns:
            RouteResult with the classified route type
        """
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
