from typing import List, Dict, Any, Optional
import uuid
import re
import chromadb
from rank_bm25 import BM25Okapi
from backend.config import CHROMADB_DIR, TOP_K, SIMILARITY_THRESHOLD, SEMANTIC_WEIGHT, BM25_WEIGHT


class VectorStore:
    """ChromaDB vector store with hybrid search (semantic + BM25)."""

    def __init__(self, collection_name: str = "knowledge_base"):
        self.client = chromadb.PersistentClient(path=str(CHROMADB_DIR))
        # Use ChromaDB's default embedding function (lightweight, no PyTorch needed)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        # BM25 index (built lazily)
        self._bm25_index = None
        self._bm25_docs = None
        self._bm25_ids = None

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenizer for BM25."""
        # Lowercase and split on non-alphanumeric characters
        text = text.lower()
        tokens = re.findall(r'\b\w+\b', text)
        return tokens

    def _build_bm25_index(self):
        """Build or rebuild the BM25 index from all documents."""
        results = self.collection.get(include=["documents", "metadatas"])

        if not results["documents"]:
            self._bm25_index = None
            self._bm25_docs = []
            self._bm25_ids = []
            return

        self._bm25_docs = results["documents"]
        self._bm25_ids = results["ids"]
        self._bm25_metadatas = results["metadatas"]

        # Tokenize all documents
        tokenized_docs = [self._tokenize(doc) for doc in self._bm25_docs]
        self._bm25_index = BM25Okapi(tokenized_docs)

    def _invalidate_bm25_index(self):
        """Invalidate the BM25 index so it gets rebuilt on next search."""
        self._bm25_index = None

    def add_documents(self, documents: List[Dict[str, Any]]) -> List[str]:
        """
        Add documents to the vector store.

        Args:
            documents: List of dicts with 'text' and metadata

        Returns:
            List of document IDs
        """
        if not documents:
            return []

        ids = []
        texts = []
        metadatas = []

        for doc in documents:
            doc_id = str(uuid.uuid4())
            ids.append(doc_id)
            texts.append(doc["text"])

            # Prepare metadata (ChromaDB only supports str, int, float, bool)
            metadata = {
                "source": str(doc.get("source", "unknown")),
                "source_type": str(doc.get("source_type", "unknown")),
                "chunk_index": int(doc.get("chunk_index", 0)),
                "total_chunks": int(doc.get("total_chunks", 1)),
            }

            if doc.get("page") is not None:
                metadata["page"] = int(doc["page"])

            if doc.get("timestamp"):
                metadata["timestamp"] = str(doc["timestamp"])

            if doc.get("token_count"):
                metadata["token_count"] = int(doc["token_count"])

            metadatas.append(metadata)

        self.collection.add(
            ids=ids,
            documents=texts,
            metadatas=metadatas
        )

        # Invalidate BM25 index so it gets rebuilt
        self._invalidate_bm25_index()

        return ids

    def search(
        self,
        query: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Semantic search for similar documents.

        Args:
            query: Search query
            top_k: Number of results to return
            threshold: Minimum similarity score
            source_filter: Optional filter by source name

        Returns:
            List of matching documents with scores
        """
        where_filter = None
        if source_filter:
            where_filter = {"source": source_filter}

        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )

        documents = []
        if results["documents"] and results["documents"][0]:
            for i, (doc, metadata, distance) in enumerate(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0]
            )):
                # Convert distance to similarity (cosine distance to similarity)
                similarity = 1 - distance

                if similarity >= threshold:
                    documents.append({
                        "text": doc,
                        "metadata": metadata,
                        "similarity": similarity,
                        "id": results["ids"][0][i] if results["ids"] else None
                    })

        return documents

    def bm25_search(
        self,
        query: str,
        top_k: int = TOP_K,
        source_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        BM25 keyword search.

        Args:
            query: Search query
            top_k: Number of results to return
            source_filter: Optional filter by source name

        Returns:
            List of matching documents with BM25 scores
        """
        # Build index if not exists
        if self._bm25_index is None:
            self._build_bm25_index()

        if not self._bm25_docs:
            return []

        # Tokenize query
        query_tokens = self._tokenize(query)

        # Get BM25 scores for all documents
        scores = self._bm25_index.get_scores(query_tokens)

        # Create list of (index, score) and sort by score descending
        scored_docs = [(i, score) for i, score in enumerate(scores)]
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        # Filter and collect results
        documents = []
        for idx, score in scored_docs[:top_k * 2]:  # Get more to account for filtering
            if score <= 0:
                continue

            metadata = self._bm25_metadatas[idx]

            # Apply source filter
            if source_filter and metadata.get("source") != source_filter:
                continue

            documents.append({
                "text": self._bm25_docs[idx],
                "metadata": metadata,
                "bm25_score": score,
                "id": self._bm25_ids[idx]
            })

            if len(documents) >= top_k:
                break

        return documents

    def hybrid_search(
        self,
        query: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        semantic_weight: float = SEMANTIC_WEIGHT,
        bm25_weight: float = BM25_WEIGHT,
        rrf_k: int = 60
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining semantic and BM25 keyword search using Reciprocal Rank Fusion.

        Args:
            query: Search query
            top_k: Number of results to return
            threshold: Minimum similarity score for semantic search
            source_filter: Optional filter by source name
            semantic_weight: Weight for semantic search results (0-1)
            bm25_weight: Weight for BM25 search results (0-1)
            rrf_k: RRF constant (higher = more weight to lower-ranked results)

        Returns:
            List of matching documents with combined scores
        """
        # Get results from both search methods
        semantic_results = self.search(
            query=query,
            top_k=top_k * 2,  # Get more to have better fusion
            threshold=threshold,
            source_filter=source_filter
        )

        bm25_results = self.bm25_search(
            query=query,
            top_k=top_k * 2,
            source_filter=source_filter
        )

        # Calculate RRF scores
        # RRF formula: score = sum(1 / (k + rank)) for each result list
        doc_scores = {}  # id -> {score, doc_data}

        # Process semantic results
        for rank, doc in enumerate(semantic_results):
            doc_id = doc["id"]
            rrf_score = semantic_weight * (1 / (rrf_k + rank + 1))

            if doc_id not in doc_scores:
                doc_scores[doc_id] = {
                    "text": doc["text"],
                    "metadata": doc["metadata"],
                    "id": doc_id,
                    "rrf_score": 0,
                    "semantic_similarity": doc.get("similarity", 0),
                    "bm25_score": 0
                }
            doc_scores[doc_id]["rrf_score"] += rrf_score
            doc_scores[doc_id]["semantic_similarity"] = doc.get("similarity", 0)

        # Process BM25 results
        for rank, doc in enumerate(bm25_results):
            doc_id = doc["id"]
            rrf_score = bm25_weight * (1 / (rrf_k + rank + 1))

            if doc_id not in doc_scores:
                doc_scores[doc_id] = {
                    "text": doc["text"],
                    "metadata": doc["metadata"],
                    "id": doc_id,
                    "rrf_score": 0,
                    "semantic_similarity": 0,
                    "bm25_score": 0
                }
            doc_scores[doc_id]["rrf_score"] += rrf_score
            doc_scores[doc_id]["bm25_score"] = doc.get("bm25_score", 0)

        # Sort by RRF score and return top_k
        sorted_docs = sorted(
            doc_scores.values(),
            key=lambda x: x["rrf_score"],
            reverse=True
        )

        # Format output with combined similarity score
        results = []
        for doc in sorted_docs[:top_k]:
            results.append({
                "text": doc["text"],
                "metadata": doc["metadata"],
                "similarity": doc["rrf_score"],  # Use RRF score as similarity
                "id": doc["id"],
                "semantic_similarity": doc["semantic_similarity"],
                "bm25_score": doc["bm25_score"]
            })

        return results

    def get_all_sources(self) -> List[Dict[str, Any]]:
        """Get all unique sources in the collection."""
        results = self.collection.get(include=["metadatas"])

        sources = {}
        for metadata in results["metadatas"]:
            source = metadata.get("source", "unknown")
            if source not in sources:
                sources[source] = {
                    "source": source,
                    "source_type": metadata.get("source_type", "unknown"),
                    "chunk_count": 0
                }
            sources[source]["chunk_count"] += 1

        return list(sources.values())

    def delete_by_source(self, source_name: str) -> int:
        """
        Delete all documents from a specific source.

        Args:
            source_name: Name of the source to delete

        Returns:
            Number of documents deleted
        """
        results = self.collection.get(
            where={"source": source_name},
            include=[]
        )

        if results["ids"]:
            self.collection.delete(ids=results["ids"])
            # Invalidate BM25 index
            self._invalidate_bm25_index()
            return len(results["ids"])

        return 0

    def count(self) -> int:
        """Get total number of documents in the collection."""
        return self.collection.count()
