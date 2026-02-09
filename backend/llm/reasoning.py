from typing import List, Dict, Any, Optional, AsyncGenerator
import httpx
from groq import Groq
from backend.config import (
    OLLAMA_BASE_URL, OLLAMA_MODEL,
    GROQ_API_KEY, GROQ_MODEL,
    USE_OLLAMA_FALLBACK, SYSTEM_PROMPT,
    LLM_MAX_TOKENS, LLM_TEMPERATURE, LLM_TIMEOUT
)


class LLMReasoning:
    """LLM integration for RAG responses using Groq (primary, free cloud) and Ollama (optional local fallback)."""

    def __init__(self):
        self.groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
        self.groq_model = GROQ_MODEL
        self.ollama_url = OLLAMA_BASE_URL
        self.ollama_model = OLLAMA_MODEL
        self.use_ollama_fallback = USE_OLLAMA_FALLBACK

    def _format_context(self, chunks: List[Dict[str, Any]]) -> str:
        """Format retrieved chunks into context string."""
        context_parts = []

        for i, chunk in enumerate(chunks, start=1):
            metadata = chunk.get("metadata", {})
            source = metadata.get("source", "Unknown")
            page = metadata.get("page")

            header = f"[Source: {source}"
            if page:
                header += f", Page {page}"
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
        """Call Groq API (primary - free cloud)."""
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

    async def _call_ollama(self, prompt: str) -> Optional[str]:
        """Call Ollama API (optional local fallback)."""
        try:
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.ollama_model,
                        "prompt": prompt,
                        "system": SYSTEM_PROMPT,
                        "stream": False
                    }
                )
                response.raise_for_status()
                return response.json().get("response", "")
        except Exception:
            return None

    def _call_ollama_sync(self, prompt: str) -> Optional[str]:
        """Call Ollama API synchronously."""
        try:
            with httpx.Client(timeout=LLM_TIMEOUT) as client:
                response = client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.ollama_model,
                        "prompt": prompt,
                        "system": SYSTEM_PROMPT,
                        "stream": False
                    }
                )
                response.raise_for_status()
                return response.json().get("response", "")
        except Exception:
            return None

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

        # Try Groq first (primary - free cloud)
        response = self._call_groq(prompt)
        provider = "groq"

        # Fallback to Ollama if Groq fails and fallback is enabled
        if response is None and self.use_ollama_fallback:
            response = await self._call_ollama(prompt)
            provider = "ollama"

        if response is None:
            return self._error_response()

        return {
            "answer": response,
            "sources": self._extract_sources(chunks),
            "provider": provider
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

        # Try Groq first (primary - free cloud)
        response = self._call_groq(prompt)
        provider = "groq"

        # Fallback to Ollama if Groq fails and fallback is enabled
        if response is None and self.use_ollama_fallback:
            response = self._call_ollama_sync(prompt)
            provider = "ollama"

        if response is None:
            return self._error_response()

        return {
            "answer": response,
            "sources": self._extract_sources(chunks),
            "provider": provider
        }
