from typing import List, Dict, Any, Optional
import uuid
import cohere
from pinecone import Pinecone, ServerlessSpec
from backend.config import (
    TOP_K, SIMILARITY_THRESHOLD, PINECONE_API_KEY, PINECONE_INDEX_NAME,
    COHERE_API_KEY, COHERE_EMBED_MODEL, COHERE_EMBED_DIMENSION, API_TIMEOUT
)

# API batch size limits
COHERE_EMBED_BATCH_SIZE = 96  # Cohere API limit per request
PINECONE_UPSERT_BATCH_SIZE = 100  # Pinecone recommended batch size
PINECONE_DELETE_BATCH_SIZE = 100  # Pinecone delete batch size

# Query limits (free tier workaround - no "list all" API)
PINECONE_MAX_QUERY_RESULTS = 10000  # Max results per query


class VectorStore:
    """Pinecone vector store with semantic search and user isolation."""

    def __init__(self):
        if not PINECONE_API_KEY:
            raise ValueError(
                "PINECONE_API_KEY is required. "
                "Get a free API key at https://app.pinecone.io"
            )

        if not COHERE_API_KEY:
            raise ValueError(
                "COHERE_API_KEY is required for embeddings. "
                "Get a free API key at https://dashboard.cohere.com/api-keys"
            )

        # Initialize Pinecone
        self.pc = Pinecone(api_key=PINECONE_API_KEY)

        # Initialize Cohere for embeddings with timeout
        self.cohere_client = cohere.Client(COHERE_API_KEY, timeout=API_TIMEOUT)
        self.embed_model = COHERE_EMBED_MODEL

        # Create index if it doesn't exist
        if PINECONE_INDEX_NAME not in self.pc.list_indexes().names():
            self.pc.create_index(
                name=PINECONE_INDEX_NAME,
                dimension=COHERE_EMBED_DIMENSION,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region="us-east-1"  # Free tier region
                )
            )

        # Connect to index
        self.index = self.pc.Index(PINECONE_INDEX_NAME)

    def _get_query_embedding(self, text: str) -> List[float]:
        """Get embedding for a query using Cohere."""
        response = self.cohere_client.embed(
            texts=[text],
            model=self.embed_model,
            input_type="search_query"
        )
        return response.embeddings[0]

    def _get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for multiple texts using Cohere."""
        if not texts:
            return []

        batch_size = COHERE_EMBED_BATCH_SIZE
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = self.cohere_client.embed(
                texts=batch,
                model=self.embed_model,
                input_type="search_document"
            )
            all_embeddings.extend(response.embeddings)

        return all_embeddings

    def add_documents(self, documents: List[Dict[str, Any]], user_id: Optional[str] = None) -> List[str]:
        """
        Add documents to the vector store.

        Args:
            documents: List of dicts with 'text' and metadata
            user_id: Optional user ID for per-user isolation

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

            # Prepare metadata
            metadata = {
                "source": str(doc.get("source", "unknown")),
                "source_type": str(doc.get("source_type", "unknown")),
                "chunk_index": int(doc.get("chunk_index", 0)),
                "total_chunks": int(doc.get("total_chunks", 1)),
            }

            if user_id:
                metadata["user_id"] = str(user_id)

            if doc.get("page") is not None:
                metadata["page"] = int(doc["page"])

            if doc.get("timestamp"):
                metadata["timestamp"] = str(doc["timestamp"])

            if doc.get("token_count"):
                metadata["token_count"] = int(doc["token_count"])

            metadatas.append(metadata)

        # Get embeddings for all texts
        embeddings = self._get_embeddings_batch(texts)

        # Prepare vectors for upsert
        vectors = []
        for doc_id, embedding, metadata, text in zip(ids, embeddings, metadatas, texts):
            # Store full text in metadata (Pinecone allows up to 40KB per vector)
            metadata["text"] = text
            vectors.append({
                "id": doc_id,
                "values": embedding,
                "metadata": metadata
            })

        # Upsert in batches
        for i in range(0, len(vectors), PINECONE_UPSERT_BATCH_SIZE):
            batch = vectors[i:i + PINECONE_UPSERT_BATCH_SIZE]
            self.index.upsert(vectors=batch)

        return ids

    def search(
        self,
        query: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Semantic search for similar documents.

        Args:
            query: Search query
            top_k: Number of results to return
            threshold: Minimum similarity score
            source_filter: Optional filter by source name
            user_id: Optional user ID for per-user isolation

        Returns:
            List of matching documents with scores
        """
        # Get query embedding
        query_embedding = self._get_query_embedding(query)

        # Build filter
        filters = []
        if source_filter:
            filters.append({"source": {"$eq": source_filter}})
        if user_id:
            filters.append({"user_id": {"$eq": str(user_id)}})

        filter_dict = None
        if len(filters) == 1:
            filter_dict = filters[0]
        elif len(filters) > 1:
            filter_dict = {"$and": filters}

        # Query Pinecone
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter=filter_dict
        )

        documents = []
        for match in results.matches:
            similarity = match.score  # Pinecone returns similarity score directly for cosine

            if similarity >= threshold:
                metadata = match.metadata.copy()
                text = metadata.pop("text", "")

                documents.append({
                    "text": text,
                    "metadata": metadata,
                    "similarity": similarity,
                    "id": match.id
                })

        return documents

    def get_all_sources(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all unique sources, optionally filtered by user."""
        sources = {}

        try:
            # Using a zero vector query with large top_k (Pinecone free tier workaround)
            dummy_vector = [0.0] * COHERE_EMBED_DIMENSION
            filter_dict = {"user_id": {"$eq": str(user_id)}} if user_id else None
            results = self.index.query(
                vector=dummy_vector,
                top_k=PINECONE_MAX_QUERY_RESULTS,
                include_metadata=True,
                filter=filter_dict,
            )

            for match in results.matches:
                metadata = match.metadata
                source = metadata.get("source", "unknown")
                if source not in sources:
                    sources[source] = {
                        "source": source,
                        "source_type": metadata.get("source_type", "unknown"),
                        "chunk_count": 0
                    }
                sources[source]["chunk_count"] += 1

        except Exception as e:
            # Return empty list on error - caller can handle appropriately
            return []

        return list(sources.values())

    def delete_by_source(self, source_name: str, user_id: Optional[str] = None) -> int:
        """
        Delete all documents from a specific source.

        Args:
            source_name: Name of the source to delete
            user_id: Optional user ID for per-user isolation

        Returns:
            Number of documents deleted
        """
        # First, find all IDs matching the filter
        dummy_vector = [0.0] * COHERE_EMBED_DIMENSION
        filters = [{"source": {"$eq": source_name}}]
        if user_id:
            filters.append({"user_id": {"$eq": str(user_id)}})
        filter_dict = filters[0] if len(filters) == 1 else {"$and": filters}

        results = self.index.query(
            vector=dummy_vector,
            top_k=PINECONE_MAX_QUERY_RESULTS,
            include_metadata=False,
            filter=filter_dict
        )

        if not results.matches:
            return 0

        ids_to_delete = [match.id for match in results.matches]

        # Delete in batches
        for i in range(0, len(ids_to_delete), PINECONE_DELETE_BATCH_SIZE):
            batch = ids_to_delete[i:i + PINECONE_DELETE_BATCH_SIZE]
            self.index.delete(ids=batch)

        return len(ids_to_delete)

    def count(self) -> int:
        """
        Get total number of documents.

        Returns:
            Number of documents
        """
        stats = self.index.describe_index_stats()
        return stats.total_vector_count

    def get_chunks_by_source(self, source_name: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all chunks for a specific source.

        Args:
            source_name: Name of the source document
            user_id: Optional user ID for per-user isolation

        Returns:
            List of chunks with text and metadata, sorted by chunk_index
        """
        dummy_vector = [0.0] * COHERE_EMBED_DIMENSION
        filters = [{"source": {"$eq": source_name}}]
        if user_id:
            filters.append({"user_id": {"$eq": str(user_id)}})
        filter_dict = filters[0] if len(filters) == 1 else {"$and": filters}

        results = self.index.query(
            vector=dummy_vector,
            top_k=PINECONE_MAX_QUERY_RESULTS,
            include_metadata=True,
            filter=filter_dict
        )

        if not results.matches:
            return []

        chunks = []
        for match in results.matches:
            metadata = match.metadata
            chunks.append({
                "id": match.id,
                "text": metadata.get("text", ""),
                "chunk_index": metadata.get("chunk_index", 0),
                "total_chunks": metadata.get("total_chunks", 1),
                "page": metadata.get("page"),
                "timestamp": metadata.get("timestamp"),
                "source_type": metadata.get("source_type", "unknown")
            })

        # Sort by chunk_index to maintain document order
        chunks.sort(key=lambda x: x["chunk_index"])

        return chunks

    def get_chunk_with_context(self, chunk_id: str, context_size: int = 1) -> Optional[Dict[str, Any]]:
        """
        Get a specific chunk by ID with surrounding context chunks.

        Args:
            chunk_id: The chunk's unique identifier
            context_size: Number of chunks to include before and after

        Returns:
            Dict with the chunk, previous chunks, and next chunks, or None if not found
        """
        # Fetch the target chunk
        try:
            result = self.index.fetch(ids=[chunk_id])
        except Exception:
            return None

        if not result.vectors or chunk_id not in result.vectors:
            return None

        vector_data = result.vectors[chunk_id]
        metadata = vector_data.metadata

        source = metadata.get("source")
        chunk_index = metadata.get("chunk_index", 0)
        total_chunks = metadata.get("total_chunks", 1)
        chunk_text = metadata.get("text", "")

        # Get all chunks from the same source to find context
        all_chunks = self.get_chunks_by_source(source)

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
