from typing import List, Dict, Any, Optional
from backend.retrieval.bm25_index import BM25Index
from backend.storage.vector_store import VectorStore


class HybridRetriever:
    """Combines dense (Pinecone) and sparse (BM25) retrieval with Reciprocal Rank Fusion."""

    def __init__(self, vector_store: VectorStore, bm25_index: BM25Index):
        self.vector_store = vector_store
        self.bm25_index = bm25_index

    @staticmethod
    def reciprocal_rank_fusion(
        result_lists: List[List[Dict[str, Any]]],
        k: int = 60
    ) -> List[Dict[str, Any]]:
        """
        Merge multiple ranked lists using Reciprocal Rank Fusion.
        RRF score = sum over lists of 1 / (k + rank_i)
        """
        scores = {}
        items = {}

        for result_list in result_lists:
            for rank, item in enumerate(result_list, start=1):
                item_id = item.get("id", item.get("text", "")[:100])
                if item_id not in scores:
                    scores[item_id] = 0.0
                    items[item_id] = item
                scores[item_id] += 1.0 / (k + rank)

        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

        results = []
        for item_id in sorted_ids:
            item = items[item_id].copy()
            item["rrf_score"] = scores[item_id]
            results.append(item)

        return results

    def search(
        self,
        query: str,
        top_k: int = 5,
        threshold: float = 0.3,
        source_filter: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Hybrid search combining dense + sparse with RRF."""
        # Dense retrieval from Pinecone
        dense_results = self.vector_store.search(
            query=query,
            top_k=top_k * 2,
            threshold=threshold,
            source_filter=source_filter,
            user_id=user_id
        )

        # Sparse retrieval from BM25
        sparse_results = self.bm25_index.search(
            query=query,
            top_k=top_k * 2,
            user_id=user_id
        )

        # Fuse with RRF
        fused = self.reciprocal_rank_fusion([dense_results, sparse_results])

        return fused[:top_k]
