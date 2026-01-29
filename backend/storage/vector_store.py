from typing import List, Dict, Any, Optional
import uuid
import chromadb
from backend.config import CHROMADB_DIR, TOP_K, SIMILARITY_THRESHOLD


class VectorStore:
    """ChromaDB vector store for document storage and retrieval."""

    def __init__(self, collection_name: str = "knowledge_base"):
        self.client = chromadb.PersistentClient(path=str(CHROMADB_DIR))
        # Use ChromaDB's default embedding function (lightweight, no PyTorch needed)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )

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

        return ids

    def search(
        self,
        query: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents.

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
            return len(results["ids"])

        return 0

    def count(self) -> int:
        """Get total number of documents in the collection."""
        return self.collection.count()
