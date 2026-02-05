from typing import Dict, Any, List, Optional
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS
from backend.routing.query_router import RouteType


class RouteHandlers:
    """Handlers for different query route types."""

    def __init__(self, vector_store=None, query_engine=None):
        """
        Initialize route handlers.

        Args:
            vector_store: VectorStore instance for META queries
            query_engine: QueryEngine instance for KNOWLEDGE queries
        """
        self.vector_store = vector_store
        self.query_engine = query_engine
        self.groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
        self.model = GROQ_MODEL

    def _call_llm(self, system_prompt: str, user_message: str) -> Optional[str]:
        """Make a direct LLM call without RAG."""
        if not self.groq_client:
            return None

        try:
            response = self.groq_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=LLM_TEMPERATURE,
                max_tokens=LLM_MAX_TOKENS
            )
            return response.choices[0].message.content
        except Exception:
            return None

    async def handle_knowledge(
        self,
        query: str,
        user_id: str,
        top_k: int = 5,
        threshold: float = 0.3,
        source_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Handle KNOWLEDGE queries using full RAG pipeline.

        This is the default behavior - delegates to QueryEngine.
        """
        if not self.query_engine:
            return self._error_response("Query engine not available")

        result = await self.query_engine.query(
            question=query,
            user_id=user_id,
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # Add route_type to response
        result["route_type"] = RouteType.KNOWLEDGE.value
        return result

    async def handle_meta(self, query: str, user_id: str) -> Dict[str, Any]:
        """
        Handle META queries about the system/documents.

        Returns information about available documents and capabilities.
        """
        if not self.vector_store:
            return self._error_response("Vector store not available")

        # Get list of user's documents
        sources = self.vector_store.get_all_sources(user_id=user_id)

        if not sources:
            answer = (
                "You don't have any documents in your knowledge base yet. "
                "You can upload documents using the upload endpoint. "
                "Supported formats: PDF, EPUB, DOCX, HTML, TXT, and Markdown files."
            )
        else:
            # Format document list
            doc_list = []
            total_chunks = 0
            for src in sources:
                doc_list.append(f"- {src['source']} ({src['source_type']}, {src['chunk_count']} chunks)")
                total_chunks += src['chunk_count']

            answer = (
                f"You have {len(sources)} document(s) in your knowledge base "
                f"with a total of {total_chunks} searchable chunks:\n\n"
                + "\n".join(doc_list)
                + "\n\nYou can ask me questions about any of these documents!"
            )

        return {
            "question": query,
            "answer": answer,
            "sources": sources,
            "chunks_used": 0,
            "provider": "system",
            "route_type": RouteType.META.value
        }

    async def handle_greeting(self, query: str) -> Dict[str, Any]:
        """
        Handle GREETING queries with friendly responses.

        Uses direct LLM call without RAG retrieval.
        """
        system_prompt = """You are a friendly personal knowledge base assistant.
Respond warmly to greetings and casual conversation.
Keep responses brief and helpful.
If the user seems to want help, mention that you can answer questions about their uploaded documents."""

        response = self._call_llm(system_prompt, query)

        if response is None:
            response = "Hello! I'm your personal knowledge base assistant. Feel free to ask me questions about your uploaded documents!"

        return {
            "question": query,
            "answer": response,
            "sources": [],
            "chunks_used": 0,
            "provider": "groq",
            "route_type": RouteType.GREETING.value
        }

    async def handle_clarification(self, query: str) -> Dict[str, Any]:
        """
        Handle CLARIFICATION queries by asking for more details.

        Returns a helpful message asking the user to be more specific.
        """
        answer = (
            f"I'd be happy to help, but your query \"{query}\" is a bit vague. "
            "Could you please be more specific? For example:\n\n"
            "- \"What does [document name] say about [topic]?\"\n"
            "- \"Explain the concept of [specific topic]\"\n"
            "- \"What are the key points from [document]?\"\n\n"
            "This helps me find the most relevant information from your knowledge base."
        )

        return {
            "question": query,
            "answer": answer,
            "sources": [],
            "chunks_used": 0,
            "provider": "system",
            "route_type": RouteType.CLARIFICATION.value
        }

    async def handle_out_of_scope(self, query: str) -> Dict[str, Any]:
        """
        Handle OUT_OF_SCOPE queries with a polite decline.

        Explains the assistant's capabilities and limitations.
        """
        answer = (
            "I'm a personal knowledge base assistant, designed to help you "
            "search and understand your uploaded documents. "
            "I'm not able to:\n\n"
            "- Write or execute code\n"
            "- Send emails or messages\n"
            "- Browse the internet\n"
            "- Perform calculations or data analysis\n"
            "- Access external systems\n\n"
            "However, I can help you find information in your uploaded documents! "
            "Try asking me a question about something you've uploaded."
        )

        return {
            "question": query,
            "answer": answer,
            "sources": [],
            "chunks_used": 0,
            "provider": "system",
            "route_type": RouteType.OUT_OF_SCOPE.value
        }

    def _error_response(self, message: str) -> Dict[str, Any]:
        """Return an error response."""
        return {
            "question": "",
            "answer": f"Error: {message}",
            "sources": [],
            "chunks_used": 0,
            "provider": None,
            "route_type": None
        }

    async def handle(
        self,
        route_type: RouteType,
        query: str,
        user_id: str,
        top_k: int = 5,
        threshold: float = 0.3,
        source_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Route to appropriate handler based on route type.

        Args:
            route_type: The classified route type
            query: User's query
            user_id: User's ID
            top_k: Number of chunks for KNOWLEDGE queries
            threshold: Similarity threshold for KNOWLEDGE queries
            source_filter: Optional source filter for KNOWLEDGE queries

        Returns:
            Response dict with answer, sources, etc.
        """
        if route_type == RouteType.KNOWLEDGE:
            return await self.handle_knowledge(
                query, user_id, top_k, threshold, source_filter
            )
        elif route_type == RouteType.META:
            return await self.handle_meta(query, user_id)
        elif route_type == RouteType.GREETING:
            return await self.handle_greeting(query)
        elif route_type == RouteType.CLARIFICATION:
            return await self.handle_clarification(query)
        elif route_type == RouteType.OUT_OF_SCOPE:
            return await self.handle_out_of_scope(query)
        else:
            # Default to KNOWLEDGE if unknown route type
            return await self.handle_knowledge(
                query, user_id, top_k, threshold, source_filter
            )
