from typing import List, Dict, Any, Optional, AsyncGenerator
from groq import Groq
from backend.config import (
    GROQ_API_KEY, GROQ_MODEL,
    SYSTEM_PROMPT,
    LLM_MAX_TOKENS, LLM_TEMPERATURE
)


class LLMReasoning:
    """LLM integration for RAG responses using Groq."""

    def __init__(self):
        self.groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
        self.groq_model = GROQ_MODEL

    def _format_context(self, chunks: List[Dict[str, Any]]) -> str:
        """Format retrieved chunks into context string."""
        context_parts = []

        for i, chunk in enumerate(chunks, start=1):
            metadata = chunk.get("metadata", {})
            source = metadata.get("source", "Unknown")
            page = metadata.get("page")
            chunk_index = metadata.get("chunk_index")
            total_chunks = metadata.get("total_chunks")

            header = f"[Passage {i} | Source: {source}"
            if page:
                header += f", Page {page}"
            if chunk_index is not None and total_chunks:
                header += f" | Part {chunk_index + 1}/{total_chunks}"
            header += "]"

            context_parts.append(f"{header}\n{chunk['text']}")

        return "\n\n---\n\n".join(context_parts)

    def _build_prompt(self, query: str, context: str) -> str:
        """Build the full prompt with context and query."""
        return f"""Context:
{context}

Question: {query}

Answer the question based on the context above. Do NOT include source citations or references in your answer - sources will be displayed separately."""

    def _extract_sources(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract source information from chunks."""
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

    def _empty_response(self) -> Dict[str, Any]:
        """Return response when no chunks are available."""
        return {
            "answer": "I don't have any relevant information in my knowledge base to answer this question.",
            "sources": [],
            "provider": None
        }

    def _error_response(self) -> Dict[str, Any]:
        """Return response when LLM call fails."""
        return {
            "answer": "I'm unable to generate a response. Please check your API keys.",
            "sources": [],
            "provider": None
        }

    def _call_groq(self, prompt: str) -> Optional[str]:
        """Call Groq API."""
        if not self.groq_client:
            return None

        try:
            response = self.groq_client.chat.completions.create(
                model=self.groq_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=LLM_TEMPERATURE,
                max_tokens=LLM_MAX_TOKENS
            )
            return response.choices[0].message.content
        except Exception:
            return None

    def _call_groq_stream(self, prompt: str):
        """Call Groq API with streaming, yielding tokens."""
        if not self.groq_client:
            return

        response = self.groq_client.chat.completions.create(
            model=self.groq_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
            stream=True
        )
        for chunk in response:
            token = chunk.choices[0].delta.content
            if token:
                yield token

    async def generate_response_stream(
        self,
        query: str,
        chunks: List[Dict[str, Any]]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream a response token by token using retrieved chunks."""
        if not chunks:
            yield {"type": "token", "content": "I don't have any relevant information in my knowledge base to answer this question."}
            yield {"type": "done", "sources": [], "chunks_used": 0, "provider": None}
            return

        context = self._format_context(chunks)
        prompt = self._build_prompt(query, context)

        try:
            for token in self._call_groq_stream(prompt):
                yield {"type": "token", "content": token}
        except Exception:
            yield {"type": "token", "content": "I'm unable to generate a response. Please check your API keys."}

        yield {
            "type": "done",
            "sources": self._extract_sources(chunks),
            "chunks_used": len(chunks),
            "provider": "groq"
        }

    async def generate_response(
        self,
        query: str,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generate a response using retrieved chunks.

        Args:
            query: User's question
            chunks: Retrieved document chunks

        Returns:
            Dict with 'answer', 'sources', and 'provider'
        """
        if not chunks:
            return self._empty_response()

        context = self._format_context(chunks)
        prompt = self._build_prompt(query, context)

        response = self._call_groq(prompt)

        if response is None:
            return self._error_response()

        return {
            "answer": response,
            "sources": self._extract_sources(chunks),
            "provider": "groq"
        }

    def generate_response_sync(
        self,
        query: str,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Synchronous version of generate_response."""
        if not chunks:
            return self._empty_response()

        context = self._format_context(chunks)
        prompt = self._build_prompt(query, context)

        response = self._call_groq(prompt)

        if response is None:
            return self._error_response()

        return {
            "answer": response,
            "sources": self._extract_sources(chunks),
            "provider": "groq"
        }
