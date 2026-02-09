from typing import Dict, Any, List, Optional, AsyncGenerator
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS, SYSTEM_PROMPT
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

    def _call_llm_stream(self, system_prompt: str, user_message: str):
        """Make a streaming LLM call, yielding tokens."""
        if not self.groq_client:
            return

        response = self.groq_client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
            stream=True
        )
        for chunk in response:
            token = chunk.choices[0].delta.content
            if token:
                yield token

    def _extract_sources(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract source information from retrieved chunks."""
        sources = []
        for chunk in chunks:
            metadata = chunk.get("metadata", {})
            sources.append({
                "source": metadata.get("source", "Unknown"),
                "page": metadata.get("page"),
                "similarity": chunk.get("similarity", 0),
                "chunk_id": chunk.get("id"),
                "text": chunk.get("text", "")
            })
        return sources

    async def handle_knowledge(
        self,
        query: str,
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
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # Add route_type to response
        result["route_type"] = RouteType.KNOWLEDGE.value
        return result

    async def handle_meta(self, query: str) -> Dict[str, Any]:
        """
        Handle META queries about the system/documents.

        Returns information about available documents and capabilities.
        """
        if not self.vector_store:
            return self._error_response("Vector store not available")

        sources = self.vector_store.get_all_sources()

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

    async def handle_summary(
        self,
        query: str,
        top_k: int = 10,
        threshold: float = 0.25,
        source_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Handle SUMMARY queries - summarize documents or topics.

        Uses RAG with a summary-focused prompt.
        """
        if not self.query_engine:
            return self._error_response("Query engine not available")

        # Get more chunks for comprehensive summary
        result = await self.query_engine.query(
            question=query,
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # If we got chunks, enhance the response with summary-specific prompt
        if result.get("chunks_used", 0) > 0 and self.groq_client:
            system_prompt = """You are a summarization assistant. Based on the provided context,
create a clear and concise summary. Structure your response with:
- A brief overview (1-2 sentences)
- Key points as bullet points
- Any important conclusions or takeaways

Be comprehensive but concise. Focus on the most important information."""

            chunks_text = "\n\n".join([
                f"[From: {src.get('source', 'Unknown')}]\n{src.get('text', '')}"
                for src in result.get("sources", [])
            ])

            enhanced_response = self._call_llm(
                system_prompt,
                f"Please summarize the following content:\n\n{chunks_text}\n\nOriginal request: {query}"
            )

            if enhanced_response:
                result["answer"] = enhanced_response

        result["route_type"] = RouteType.SUMMARY.value
        return result

    async def handle_comparison(
        self,
        query: str,
        top_k: int = 10,
        threshold: float = 0.25,
        source_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Handle COMPARISON queries - compare two or more things.

        Uses RAG with a comparison-focused prompt.
        """
        if not self.query_engine:
            return self._error_response("Query engine not available")

        # Get more chunks to find information about both items being compared
        result = await self.query_engine.query(
            question=query,
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # If we got chunks, enhance with comparison-specific prompt
        if result.get("chunks_used", 0) > 0 and self.groq_client:
            system_prompt = """You are a comparison assistant. Based on the provided context,
create a clear comparison. Structure your response with:
- Brief introduction of items being compared
- Similarities (if any)
- Key differences (as a structured list or table format)
- Summary/conclusion

If information about one or more items is missing from the context, note what's available
and what couldn't be found."""

            chunks_text = "\n\n".join([
                f"[From: {src.get('source', 'Unknown')}]\n{src.get('text', '')}"
                for src in result.get("sources", [])
            ])

            enhanced_response = self._call_llm(
                system_prompt,
                f"Please compare based on the following content:\n\n{chunks_text}\n\nComparison request: {query}"
            )

            if enhanced_response:
                result["answer"] = enhanced_response

        result["route_type"] = RouteType.COMPARISON.value
        return result

    async def handle_follow_up(
        self,
        query: str,
        top_k: int = 5,
        threshold: float = 0.3,
        source_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Handle FOLLOW_UP queries - questions that reference previous context.

        Note: Currently routes to KNOWLEDGE as we don't have conversation history.
        The frontend should provide context for true follow-up handling.
        """
        if not self.query_engine:
            return self._error_response("Query engine not available")

        # For now, treat as knowledge query
        # TODO: Accept conversation history parameter for better context
        result = await self.query_engine.query(
            question=query,
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # If no results, provide helpful message
        if result.get("chunks_used", 0) == 0:
            result["answer"] = (
                "I don't have context from our previous conversation. "
                "Could you please rephrase your question with more details? "
                "For example, instead of 'tell me more about that', "
                "try 'tell me more about [specific topic]'."
            )

        result["route_type"] = RouteType.FOLLOW_UP.value
        return result

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
        top_k: int = 5,
        threshold: float = 0.3,
        source_filter: Optional[str] = None,
        rewritten_query: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Route to appropriate handler based on route type.

        Args:
            route_type: The classified route type
            query: User's original query
            top_k: Number of chunks for KNOWLEDGE queries
            threshold: Similarity threshold for KNOWLEDGE queries
            source_filter: Optional source filter for KNOWLEDGE queries
            rewritten_query: Context-resolved query (if references were resolved)

        Returns:
            Response dict with answer, sources, etc.
        """
        # Use rewritten query for RAG-based routes, original for others
        effective_query = rewritten_query or query

        if route_type == RouteType.KNOWLEDGE:
            return await self.handle_knowledge(
                effective_query, top_k, threshold, source_filter
            )
        elif route_type == RouteType.META:
            return await self.handle_meta(query)
        elif route_type == RouteType.GREETING:
            return await self.handle_greeting(query)
        elif route_type == RouteType.CLARIFICATION:
            return await self.handle_clarification(query)
        elif route_type == RouteType.OUT_OF_SCOPE:
            return await self.handle_out_of_scope(query)
        elif route_type == RouteType.SUMMARY:
            return await self.handle_summary(
                effective_query, top_k=10, threshold=0.25, source_filter=source_filter
            )
        elif route_type == RouteType.COMPARISON:
            return await self.handle_comparison(
                effective_query, top_k=10, threshold=0.25, source_filter=source_filter
            )
        elif route_type == RouteType.FOLLOW_UP:
            return await self.handle_follow_up(
                effective_query, top_k, threshold, source_filter
            )
        else:
            return await self.handle_knowledge(
                effective_query, top_k, threshold, source_filter
            )

    async def handle_stream(
        self,
        route_type: RouteType,
        query: str,
        top_k: int = 5,
        threshold: float = 0.3,
        source_filter: Optional[str] = None,
        rewritten_query: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream response events based on route type."""
        effective_query = rewritten_query or query

        # Non-streaming routes: send full answer at once
        if route_type in (RouteType.META, RouteType.CLARIFICATION, RouteType.OUT_OF_SCOPE):
            result = await self.handle(
                route_type, query, top_k, threshold, source_filter, rewritten_query
            )
            yield {"type": "token", "content": result["answer"]}
            yield {
                "type": "done",
                "sources": result.get("sources", []),
                "chunks_used": result.get("chunks_used", 0),
                "provider": result.get("provider"),
                "route_type": result.get("route_type")
            }
            return

        # GREETING: stream the short LLM response
        if route_type == RouteType.GREETING:
            system_prompt = """You are a friendly personal knowledge base assistant.
Respond warmly to greetings and casual conversation.
Keep responses brief and helpful.
If the user seems to want help, mention that you can answer questions about their uploaded documents."""
            try:
                for token in self._call_llm_stream(system_prompt, query):
                    yield {"type": "token", "content": token}
            except Exception:
                yield {"type": "token", "content": "Hello! I'm your personal knowledge base assistant. Feel free to ask me questions about your uploaded documents!"}
            yield {
                "type": "done",
                "sources": [],
                "chunks_used": 0,
                "provider": "groq",
                "route_type": RouteType.GREETING.value
            }
            return

        # RAG-based routes: retrieve chunks, then stream LLM
        if not self.query_engine:
            yield {"type": "token", "content": "Error: Query engine not available"}
            yield {"type": "done", "sources": [], "chunks_used": 0, "provider": None, "route_type": None}
            return

        # Determine retrieval params
        if route_type in (RouteType.SUMMARY, RouteType.COMPARISON):
            retrieve_top_k = 10
            retrieve_threshold = 0.25
        else:
            retrieve_top_k = top_k
            retrieve_threshold = threshold

        chunks, reranked = self.query_engine.retrieve(
            question=effective_query,
            top_k=retrieve_top_k,
            threshold=retrieve_threshold,
            source_filter=source_filter
        )

        sources = self._extract_sources(chunks)

        if not chunks:
            if route_type == RouteType.FOLLOW_UP:
                yield {"type": "token", "content": (
                    "I don't have context from our previous conversation. "
                    "Could you please rephrase your question with more details? "
                    "For example, instead of 'tell me more about that', "
                    "try 'tell me more about [specific topic]'."
                )}
            else:
                yield {"type": "token", "content": "I don't have any relevant information in my knowledge base to answer this question."}
            yield {
                "type": "done",
                "sources": [],
                "chunks_used": 0,
                "provider": None,
                "route_type": route_type.value
            }
            return

        # Build context and choose prompt based on route type
        chunks_text = "\n\n".join([
            f"[From: {chunk.get('metadata', {}).get('source', 'Unknown')}]\n{chunk.get('text', '')}"
            for chunk in chunks
        ])

        if route_type == RouteType.SUMMARY:
            system_prompt = """You are a summarization assistant. Based on the provided context,
create a clear and concise summary. Structure your response with:
- A brief overview (1-2 sentences)
- Key points as bullet points
- Any important conclusions or takeaways

Be comprehensive but concise. Focus on the most important information."""
            user_message = f"Please summarize the following content:\n\n{chunks_text}\n\nOriginal request: {effective_query}"
        elif route_type == RouteType.COMPARISON:
            system_prompt = """You are a comparison assistant. Based on the provided context,
create a clear comparison. Structure your response with:
- Brief introduction of items being compared
- Similarities (if any)
- Key differences (as a structured list or table format)
- Summary/conclusion

If information about one or more items is missing from the context, note what's available
and what couldn't be found."""
            user_message = f"Please compare based on the following content:\n\n{chunks_text}\n\nComparison request: {effective_query}"
        else:
            # KNOWLEDGE / FOLLOW_UP: standard RAG prompt
            system_prompt = SYSTEM_PROMPT
            context = "\n\n---\n\n".join([
                f"[Source: {chunk.get('metadata', {}).get('source', 'Unknown')}]\n{chunk.get('text', '')}"
                for chunk in chunks
            ])
            user_message = f"Context:\n{context}\n\nQuestion: {effective_query}\n\nAnswer the question based on the context above. Do NOT include source citations or references in your answer - sources will be displayed separately."

        # Stream the LLM response
        try:
            for token in self._call_llm_stream(system_prompt, user_message):
                yield {"type": "token", "content": token}
        except Exception:
            yield {"type": "token", "content": "I'm unable to generate a response. Please check your API keys."}

        yield {
            "type": "done",
            "sources": sources,
            "chunks_used": len(chunks),
            "provider": "groq",
            "route_type": route_type.value
        }
