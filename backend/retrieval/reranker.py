from typing import List, Dict, Any
from langchain_cohere import CohereRerank
from langchain_core.documents import Document
from backend.config import COHERE_API_KEY, RERANK_MODEL, RERANK_TOP_K


class Reranker:
    """Cohere-based reranker for improving retrieval quality."""

    def __init__(self):
        self.reranker = None
        self.available = False

        if COHERE_API_KEY:
            try:
                self.reranker = CohereRerank(
                    model=RERANK_MODEL,
                    cohere_api_key=COHERE_API_KEY,
                    top_n=RERANK_TOP_K,
                )
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
            # Build LangChain Document objects with index metadata
            lc_docs = [
                Document(page_content=doc["text"], metadata={"_index": i, **doc.get("metadata", {})})
                for i, doc in enumerate(documents)
            ]

            # Update top_n for this call if different from default
            self.reranker.top_n = min(top_k, len(documents))

            # Call Cohere rerank via LangChain
            reranked = self.reranker.compress_documents(lc_docs, query)

            # Map back to original format
            reranked_docs = []
            for result in reranked:
                original_index = result.metadata.get("_index", 0)
                doc = documents[original_index].copy()
                doc["rerank_score"] = result.metadata.get("relevance_score", 0)
                doc["original_rank"] = original_index
                reranked_docs.append(doc)

            return reranked_docs

        except Exception:
            # Fall back to original order - reranking is optional
            return documents[:top_k]

    def is_available(self) -> bool:
        """Check if reranker is available."""
        return self.available
