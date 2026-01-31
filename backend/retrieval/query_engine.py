from typing import Dict, Any, Optional
from backend.storage.vector_store import VectorStore
from backend.llm.reasoning import LLMReasoning
from backend.retrieval.reranker import Reranker
from backend.config import TOP_K, SIMILARITY_THRESHOLD, USE_HYBRID_SEARCH, USE_RERANKING, RERANK_TOP_K


class QueryEngine:
    """RAG query engine combining retrieval, reranking, and LLM generation."""

    def __init__(self):
        self.vector_store = VectorStore()
        self.llm = LLMReasoning()
        self.reranker = Reranker()

    async def query(
        self,
        question: str,
        user_id: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        use_hybrid: bool = USE_HYBRID_SEARCH,
        use_reranking: bool = USE_RERANKING
    ) -> Dict[str, Any]:
        """
        Process a query through the RAG pipeline for a specific user.

        Args:
            question: User's question
            user_id: The user's unique identifier
            top_k: Number of chunks to retrieve
            threshold: Minimum similarity threshold
            source_filter: Optional filter by source name
            use_hybrid: Use hybrid search (semantic + BM25) - defaults to config
            use_reranking: Use Cohere reranking - defaults to config

        Returns:
            Dict with 'answer', 'sources', 'chunks_used', and 'provider'
        """
        # Step 1: Retrieve relevant chunks using hybrid or semantic search
        # Get more chunks if reranking (reranker will filter down)
        retrieve_k = top_k * 2 if use_reranking and self.reranker.is_available() else top_k

        if use_hybrid:
            chunks = self.vector_store.hybrid_search(
                query=question,
                user_id=user_id,
                top_k=retrieve_k,
                threshold=threshold,
                source_filter=source_filter
            )
        else:
            chunks = self.vector_store.search(
                query=question,
                user_id=user_id,
                top_k=retrieve_k,
                threshold=threshold,
                source_filter=source_filter
            )

        # Step 2: Rerank if enabled and available
        reranked = False
        if use_reranking and self.reranker.is_available() and chunks:
            chunks = self.reranker.rerank(
                query=question,
                documents=chunks,
                top_k=RERANK_TOP_K
            )
            reranked = True

        # Step 3: Generate response with LLM
        result = await self.llm.generate_response(
            query=question,
            chunks=chunks
        )

        return {
            "question": question,
            "answer": result["answer"],
            "sources": result["sources"],
            "chunks_used": len(chunks),
            "provider": result["provider"],
            "reranked": reranked
        }

    def query_sync(
        self,
        question: str,
        user_id: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        use_hybrid: bool = USE_HYBRID_SEARCH,
        use_reranking: bool = USE_RERANKING
    ) -> Dict[str, Any]:
        """Synchronous version of query for a specific user."""
        # Step 1: Retrieve relevant chunks using hybrid or semantic search
        # Get more chunks if reranking (reranker will filter down)
        retrieve_k = top_k * 2 if use_reranking and self.reranker.is_available() else top_k

        if use_hybrid:
            chunks = self.vector_store.hybrid_search(
                query=question,
                user_id=user_id,
                top_k=retrieve_k,
                threshold=threshold,
                source_filter=source_filter
            )
        else:
            chunks = self.vector_store.search(
                query=question,
                user_id=user_id,
                top_k=retrieve_k,
                threshold=threshold,
                source_filter=source_filter
            )

        # Step 2: Rerank if enabled and available
        reranked = False
        if use_reranking and self.reranker.is_available() and chunks:
            chunks = self.reranker.rerank(
                query=question,
                documents=chunks,
                top_k=RERANK_TOP_K
            )
            reranked = True

        # Step 3: Generate response with LLM
        result = self.llm.generate_response_sync(
            query=question,
            chunks=chunks
        )

        return {
            "question": question,
            "answer": result["answer"],
            "sources": result["sources"],
            "chunks_used": len(chunks),
            "provider": result["provider"],
            "reranked": reranked
        }
