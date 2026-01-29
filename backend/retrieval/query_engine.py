from typing import Dict, Any, Optional
from backend.storage.vector_store import VectorStore
from backend.llm.reasoning import LLMReasoning
from backend.config import TOP_K, SIMILARITY_THRESHOLD


class QueryEngine:
    """RAG query engine combining retrieval and LLM generation."""

    def __init__(self):
        self.vector_store = VectorStore()
        self.llm = LLMReasoning()

    async def query(
        self,
        question: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a query through the RAG pipeline.

        Args:
            question: User's question
            top_k: Number of chunks to retrieve
            threshold: Minimum similarity threshold
            source_filter: Optional filter by source name

        Returns:
            Dict with 'answer', 'sources', 'chunks_used', and 'provider'
        """
        # Step 1: Retrieve relevant chunks
        chunks = self.vector_store.search(
            query=question,
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # Step 2: Generate response with LLM
        result = await self.llm.generate_response(
            query=question,
            chunks=chunks
        )

        return {
            "question": question,
            "answer": result["answer"],
            "sources": result["sources"],
            "chunks_used": len(chunks),
            "provider": result["provider"]
        }

    def query_sync(
        self,
        question: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Synchronous version of query."""
        # Step 1: Retrieve relevant chunks
        chunks = self.vector_store.search(
            query=question,
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # Step 2: Generate response with LLM
        result = self.llm.generate_response_sync(
            query=question,
            chunks=chunks
        )

        return {
            "question": question,
            "answer": result["answer"],
            "sources": result["sources"],
            "chunks_used": len(chunks),
            "provider": result["provider"]
        }
