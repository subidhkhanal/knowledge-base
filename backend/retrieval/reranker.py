from typing import List, Dict, Any, Optional
import cohere
from backend.config import COHERE_API_KEY, RERANK_MODEL, RERANK_TOP_K, API_TIMEOUT


class Reranker:
    """Cohere-based reranker for improving retrieval quality."""

    def __init__(self):
        self.client = None
        self.available = False

        if COHERE_API_KEY:
            try:
                self.client = cohere.Client(COHERE_API_KEY, timeout=API_TIMEOUT)
                self.available = True
            except Exception:
                # Silently fail - reranking is optional, search will still work
                pass

    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = RERANK_TOP_K
    ) -> List[Dict[str, Any]]:
        """
        Rerank documents using Cohere's rerank model.

        Args:
            query: The search query
            documents: List of documents with 'text' field
            top_k: Number of top results to return

        Returns:
            Reranked list of documents with relevance scores
        """
        if not self.available or not documents:
            return documents[:top_k]

        try:
            # Extract text from documents for reranking
            doc_texts = [doc["text"] for doc in documents]

            # Call Cohere rerank API
            response = self.client.rerank(
                model=RERANK_MODEL,
                query=query,
                documents=doc_texts,
                top_n=min(top_k, len(documents))
            )

            # Reorder documents based on rerank results
            reranked_docs = []
            for result in response.results:
                doc = documents[result.index].copy()
                doc["rerank_score"] = result.relevance_score
                doc["original_rank"] = result.index
                reranked_docs.append(doc)

            return reranked_docs

        except Exception:
            # Fall back to original order - reranking is optional
            return documents[:top_k]

    def is_available(self) -> bool:
        """Check if reranker is available."""
        return self.available
