from typing import List, Dict, Any, Optional
import httpx
from groq import Groq
from backend.config import (
    OLLAMA_BASE_URL, OLLAMA_MODEL,
    GROQ_API_KEY, GROQ_MODEL,
    USE_OLLAMA_FALLBACK, SYSTEM_PROMPT
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

    def _call_groq(self, prompt: str) -> Optional[str]:
        """Call Groq API (primary - free cloud)."""
        if not self.groq_client:
            print("Groq API key not configured")
            return None

        try:
            response = self.groq_client.chat.completions.create(
                model=self.groq_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=2048
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"Groq error: {e}")
            return None

    async def _call_ollama(self, prompt: str) -> Optional[str]:
        """Call Ollama API (optional local fallback)."""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
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
        except Exception as e:
            print(f"Ollama error: {e}")
            return None

    def _call_ollama_sync(self, prompt: str) -> Optional[str]:
        """Call Ollama API synchronously."""
        try:
            with httpx.Client(timeout=60.0) as client:
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
        except Exception as e:
            print(f"Ollama error: {e}")
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
            return {
                "answer": "I don't have any relevant information in my knowledge base to answer this question.",
                "sources": [],
                "provider": None
            }

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
            return {
                "answer": "I'm unable to generate a response. Please check your GROQ_API_KEY in .env file.",
                "sources": [],
                "provider": None
            }

        # Extract sources from chunks (include chunk_id and text for context viewing)
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

        return {
            "answer": response,
            "sources": sources,
            "provider": provider
        }

    def generate_response_sync(
        self,
        query: str,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Synchronous version of generate_response."""
        if not chunks:
            return {
                "answer": "I don't have any relevant information in my knowledge base to answer this question.",
                "sources": [],
                "provider": None
            }

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
            return {
                "answer": "I'm unable to generate a response. Please check your GROQ_API_KEY in .env file.",
                "sources": [],
                "provider": None
            }

        # Extract sources from chunks (include chunk_id and text for context viewing)
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

        return {
            "answer": response,
            "sources": sources,
            "provider": provider
        }
