from typing import List, Dict, Any, Optional
import uuid
import re
import chromadb
from rank_bm25 import BM25Okapi
from backend.config import CHROMADB_DIR, TOP_K, SIMILARITY_THRESHOLD, SEMANTIC_WEIGHT, BM25_WEIGHT, HYBRID_MIN_THRESHOLD


class VectorStore:
    """ChromaDB vector store with hybrid search (semantic + BM25) and user isolation."""

    def __init__(self, collection_name: str = "knowledge_base"):
        self.client = chromadb.PersistentClient(path=str(CHROMADB_DIR))
        # Use ChromaDB's default embedding function (lightweight, no PyTorch needed)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        # BM25 index (built lazily per user)
        self._bm25_cache = {}  # user_id -> {index, docs, ids, metadatas}

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenizer for BM25."""
        # Lowercase and split on non-alphanumeric characters
        text = text.lower()
        tokens = re.findall(r'\b\w+\b', text)
        return tokens

    def _build_bm25_index(self, user_id: str):
        """Build or rebuild the BM25 index for a specific user."""
        results = self.collection.get(
            where={"user_id": user_id},
            include=["documents", "metadatas"]
        )

        if not results["documents"]:
            self._bm25_cache[user_id] = {
                "index": None,
                "docs": [],
                "ids": [],
                "metadatas": []
            }
            return

        docs = results["documents"]
        ids = results["ids"]
        metadatas = results["metadatas"]

        # Tokenize all documents
        tokenized_docs = [self._tokenize(doc) for doc in docs]
        index = BM25Okapi(tokenized_docs)

        self._bm25_cache[user_id] = {
            "index": index,
            "docs": docs,
            "ids": ids,
            "metadatas": metadatas
        }

    def _invalidate_bm25_index(self, user_id: str):
        """Invalidate the BM25 index for a user so it gets rebuilt on next search."""
        if user_id in self._bm25_cache:
            del self._bm25_cache[user_id]

    def add_documents(self, documents: List[Dict[str, Any]], user_id: str) -> List[str]:
        """
        Add documents to the vector store for a specific user.

        Args:
            documents: List of dicts with 'text' and metadata
            user_id: The user's unique identifier

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
                "user_id": user_id,  # User isolation
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

        # Invalidate BM25 index for this user
        self._invalidate_bm25_index(user_id)

        return ids

    def search(
        self,
        query: str,
        user_id: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Semantic search for similar documents belonging to a specific user.

        Args:
            query: Search query
            user_id: The user's unique identifier
            top_k: Number of results to return
            threshold: Minimum similarity score
            source_filter: Optional filter by source name

        Returns:
            List of matching documents with scores
        """
        # Build where filter with user_id
        if source_filter:
            where_filter = {"$and": [{"user_id": user_id}, {"source": source_filter}]}
        else:
            where_filter = {"user_id": user_id}

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
        user_id: str,
        top_k: int = TOP_K,
        source_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        BM25 keyword search for a specific user.

        Args:
            query: Search query
            user_id: The user's unique identifier
            top_k: Number of results to return
            source_filter: Optional filter by source name

        Returns:
            List of matching documents with BM25 scores
        """
        # Build index if not exists for this user
        if user_id not in self._bm25_cache:
            self._build_bm25_index(user_id)

        cache = self._bm25_cache.get(user_id, {})
        if not cache.get("docs"):
            return []

        index = cache["index"]
        docs = cache["docs"]
        ids = cache["ids"]
        metadatas = cache["metadatas"]

        # Tokenize query
        query_tokens = self._tokenize(query)

        # Get BM25 scores for all documents
        scores = index.get_scores(query_tokens)

        # Create list of (index, score) and sort by score descending
        scored_docs = [(i, score) for i, score in enumerate(scores)]
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        # Filter and collect results
        documents = []
        for idx, score in scored_docs[:top_k * 2]:  # Get more to account for filtering
            if score <= 0:
                continue

            metadata = metadatas[idx]

            # Apply source filter
            if source_filter and metadata.get("source") != source_filter:
                continue

            documents.append({
                "text": docs[idx],
                "metadata": metadata,
                "bm25_score": score,
                "id": ids[idx]
            })

            if len(documents) >= top_k:
                break

        return documents

    def hybrid_search(
        self,
        query: str,
        user_id: str,
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
            user_id: The user's unique identifier
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
            user_id=user_id,
            top_k=top_k * 2,  # Get more to have better fusion
            threshold=threshold,
            source_filter=source_filter
        )

        bm25_results = self.bm25_search(
            query=query,
            user_id=user_id,
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

        # Filter out results with low semantic similarity to avoid irrelevant sources
        sorted_docs = [
            doc for doc in sorted_docs
            if doc["semantic_similarity"] >= HYBRID_MIN_THRESHOLD
        ]

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

    def get_all_sources(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all unique sources for a specific user."""
        results = self.collection.get(
            where={"user_id": user_id},
            include=["metadatas"]
        )

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

    def delete_by_source(self, source_name: str, user_id: str) -> int:
        """
        Delete all documents from a specific source for a specific user.

        Args:
            source_name: Name of the source to delete
            user_id: The user's unique identifier

        Returns:
            Number of documents deleted
        """
        results = self.collection.get(
            where={"$and": [{"user_id": user_id}, {"source": source_name}]},
            include=[]
        )

        if results["ids"]:
            self.collection.delete(ids=results["ids"])
            # Invalidate BM25 index for this user
            self._invalidate_bm25_index(user_id)
            return len(results["ids"])

        return 0

    def count(self, user_id: Optional[str] = None) -> int:
        """
        Get total number of documents, optionally filtered by user.

        Args:
            user_id: Optional user ID to filter by

        Returns:
            Number of documents
        """
        if user_id:
            results = self.collection.get(where={"user_id": user_id}, include=[])
            return len(results["ids"])
        return self.collection.count()

    def get_chunks_by_source(self, source_name: str, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all chunks for a specific source belonging to a user.

        Args:
            source_name: Name of the source document
            user_id: The user's unique identifier

        Returns:
            List of chunks with text and metadata, sorted by chunk_index
        """
        results = self.collection.get(
            where={"$and": [{"user_id": user_id}, {"source": source_name}]},
            include=["documents", "metadatas"]
        )

        if not results["documents"]:
            return []

        chunks = []
        for i, (doc, metadata) in enumerate(zip(results["documents"], results["metadatas"])):
            chunks.append({
                "id": results["ids"][i],
                "text": doc,
                "chunk_index": metadata.get("chunk_index", 0),
                "total_chunks": metadata.get("total_chunks", 1),
                "page": metadata.get("page"),
                "timestamp": metadata.get("timestamp"),
                "source_type": metadata.get("source_type", "unknown")
            })

        # Sort by chunk_index to maintain document order
        chunks.sort(key=lambda x: x["chunk_index"])

        return chunks

    def get_chunk_with_context(self, chunk_id: str, user_id: str, context_size: int = 1) -> Optional[Dict[str, Any]]:
        """
        Get a specific chunk by ID with surrounding context chunks.

        Args:
            chunk_id: The chunk's unique identifier
            user_id: The user's unique identifier
            context_size: Number of chunks to include before and after

        Returns:
            Dict with the chunk, previous chunks, and next chunks, or None if not found
        """
        # Get the target chunk
        result = self.collection.get(
            ids=[chunk_id],
            include=["documents", "metadatas"]
        )

        if not result["documents"]:
            return None

        chunk_text = result["documents"][0]
        metadata = result["metadatas"][0]

        # Verify user owns this chunk
        if metadata.get("user_id") != user_id:
            return None

        source = metadata.get("source")
        chunk_index = metadata.get("chunk_index", 0)
        total_chunks = metadata.get("total_chunks", 1)

        # Get all chunks from the same source to find context
        all_chunks = self.get_chunks_by_source(source, user_id)

        # Find previous and next chunks
        prev_chunks = []
        next_chunks = []

        for chunk in all_chunks:
            idx = chunk["chunk_index"]
            if chunk_index - context_size <= idx < chunk_index:
                prev_chunks.append(chunk)
            elif chunk_index < idx <= chunk_index + context_size:
                next_chunks.append(chunk)

        # Sort context chunks
        prev_chunks.sort(key=lambda x: x["chunk_index"])
        next_chunks.sort(key=lambda x: x["chunk_index"])

        return {
            "id": chunk_id,
            "text": chunk_text,
            "source": source,
            "source_type": metadata.get("source_type", "unknown"),
            "page": metadata.get("page"),
            "chunk_index": chunk_index,
            "total_chunks": total_chunks,
            "prev_chunks": prev_chunks,
            "next_chunks": next_chunks
        }
