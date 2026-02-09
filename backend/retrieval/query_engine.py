from typing import Dict, Any, Optional, List
from backend.storage.vector_store import VectorStore
from backend.llm.reasoning import LLMReasoning
from backend.retrieval.reranker import Reranker
from backend.config import TOP_K, SIMILARITY_THRESHOLD, USE_RERANKING, RERANK_TOP_K


class QueryEngine:
    """RAG query engine combining retrieval, reranking, and LLM generation."""

    def __init__(self, vector_store: VectorStore = None):
        self.vector_store = vector_store or VectorStore()
        self.llm = LLMReasoning()
        self.reranker = Reranker()

    def _retrieve_and_rerank(
        self,
        question: str,
        top_k: int,
        threshold: float,
        source_filter: Optional[str],
        use_reranking: bool
    ) -> tuple[List[Dict[str, Any]], bool]:
        """Retrieve chunks and optionally rerank them."""
        # Get more chunks if reranking (reranker will filter down)
        retrieve_k = top_k * 2 if use_reranking and self.reranker.is_available() else top_k

        chunks = self.vector_store.search(
            query=question,
            top_k=retrieve_k,
            threshold=threshold,
            source_filter=source_filter
        )

        # Rerank if enabled and available
        reranked = False
        if use_reranking and self.reranker.is_available() and chunks:
            chunks = self.reranker.rerank(
                query=question,
                documents=chunks,
                top_k=RERANK_TOP_K
            )
            reranked = True

        return chunks, reranked

    def _format_response(
        self,
        question: str,
        result: Dict[str, Any],
        chunks: List[Dict[str, Any]],
        reranked: bool
    ) -> Dict[str, Any]:
        """Format the final response."""
        return {
            "question": question,
            "answer": result["answer"],
            "sources": result["sources"],
            "chunks_used": len(chunks),
            "provider": result["provider"],
            "reranked": reranked
        }

    def retrieve(
        self,
        question: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        use_reranking: bool = USE_RERANKING
    ) -> tuple[List[Dict[str, Any]], bool]:
        """Retrieve and rerank chunks without LLM generation (for streaming)."""
        return self._retrieve_and_rerank(
            question, top_k, threshold, source_filter, use_reranking
        )

    async def query(
        self,
        question: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        use_reranking: bool = USE_RERANKING
    ) -> Dict[str, Any]:
        """
        Process a query through the RAG pipeline.

        Args:
            question: User's question
            top_k: Number of chunks to retrieve
            threshold: Minimum similarity threshold
            source_filter: Optional filter by source name
            use_reranking: Use Cohere reranking - defaults to config

        Returns:
            Dict with 'answer', 'sources', 'chunks_used', and 'provider'
        """
        chunks, reranked = self._retrieve_and_rerank(
            question, top_k, threshold, source_filter, use_reranking
        )

        result = await self.llm.generate_response(query=question, chunks=chunks)

        return self._format_response(question, result, chunks, reranked)

    def query_sync(
        self,
        question: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        use_reranking: bool = USE_RERANKING
    ) -> Dict[str, Any]:
        """Synchronous version of query."""
        chunks, reranked = self._retrieve_and_rerank(
            question, top_k, threshold, source_filter, use_reranking
        )

        result = self.llm.generate_response_sync(query=question, chunks=chunks)

        return self._format_response(question, result, chunks, reranked)
