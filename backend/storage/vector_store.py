from typing import List, Dict, Any, Optional
import uuid
import cohere
from pinecone import Pinecone, ServerlessSpec
from backend.config import (
    TOP_K, SIMILARITY_THRESHOLD, PINECONE_API_KEY, PINECONE_INDEX_NAME,
    COHERE_API_KEY, COHERE_EMBED_MODEL, COHERE_EMBED_DIMENSION
)


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

        # Initialize Cohere for embeddings
        self.cohere_client = cohere.Client(COHERE_API_KEY)
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

    def _get_embedding(self, text: str) -> List[float]:
        """Get embedding for a single text using Cohere."""
        response = self.cohere_client.embed(
            texts=[text],
            model=self.embed_model,
            input_type="search_document"
        )
        return response.embeddings[0]

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

        # Cohere has a limit of 96 texts per batch
        batch_size = 96
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

            # Prepare metadata
            metadata = {
                "user_id": user_id,
                "source": str(doc.get("source", "unknown")),
                "source_type": str(doc.get("source_type", "unknown")),
                "chunk_index": int(doc.get("chunk_index", 0)),
                "total_chunks": int(doc.get("total_chunks", 1)),
                "text": doc["text"][:1000]  # Store truncated text in metadata for retrieval
            }

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

        # Upsert in batches of 100
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            self.index.upsert(vectors=batch)

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
        # Get query embedding
        query_embedding = self._get_query_embedding(query)

        # Build filter
        filter_dict = {"user_id": {"$eq": user_id}}
        if source_filter:
            filter_dict["source"] = {"$eq": source_filter}

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

    def hybrid_search(
        self,
        query: str,
        user_id: str,
        top_k: int = TOP_K,
        threshold: float = SIMILARITY_THRESHOLD,
        source_filter: Optional[str] = None,
        **kwargs  # Accept but ignore BM25-related params for backward compatibility
    ) -> List[Dict[str, Any]]:
        """
        Search for documents. On Pinecone free tier, this is semantic-only.
        BM25 hybrid search requires Pinecone paid tier.

        Args:
            query: Search query
            user_id: The user's unique identifier
            top_k: Number of results to return
            threshold: Minimum similarity score
            source_filter: Optional filter by source name

        Returns:
            List of matching documents with scores
        """
        # On free tier, hybrid search is just semantic search
        return self.search(
            query=query,
            user_id=user_id,
            top_k=top_k,
            threshold=threshold,
            source_filter=source_filter
        )

    def get_all_sources(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all unique sources for a specific user."""
        # Query with a dummy vector to get all documents for the user
        # We'll use pagination to handle large datasets
        sources = {}

        # Use list with pagination
        # Note: Pinecone doesn't have a direct "get all" - we need to query
        # We'll do a broad query and aggregate
        try:
            # Get a sample of vectors to find sources
            # Using a zero vector query with large top_k
            dummy_vector = [0.0] * COHERE_EMBED_DIMENSION
            results = self.index.query(
                vector=dummy_vector,
                top_k=10000,  # Get many results
                include_metadata=True,
                filter={"user_id": {"$eq": user_id}}
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
            print(f"Error getting sources: {e}")

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
        # First, find all IDs matching the filter
        dummy_vector = [0.0] * COHERE_EMBED_DIMENSION
        results = self.index.query(
            vector=dummy_vector,
            top_k=10000,
            include_metadata=False,
            filter={
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"source": {"$eq": source_name}}
                ]
            }
        )

        if not results.matches:
            return 0

        ids_to_delete = [match.id for match in results.matches]

        # Delete in batches
        batch_size = 100
        for i in range(0, len(ids_to_delete), batch_size):
            batch = ids_to_delete[i:i + batch_size]
            self.index.delete(ids=batch)

        return len(ids_to_delete)

    def count(self, user_id: Optional[str] = None) -> int:
        """
        Get total number of documents, optionally filtered by user.

        Args:
            user_id: Optional user ID to filter by

        Returns:
            Number of documents
        """
        if user_id:
            # Query to count user's documents
            dummy_vector = [0.0] * COHERE_EMBED_DIMENSION
            results = self.index.query(
                vector=dummy_vector,
                top_k=10000,
                include_metadata=False,
                filter={"user_id": {"$eq": user_id}}
            )
            return len(results.matches)

        # Get total count from index stats
        stats = self.index.describe_index_stats()
        return stats.total_vector_count

    def get_chunks_by_source(self, source_name: str, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all chunks for a specific source belonging to a user.

        Args:
            source_name: Name of the source document
            user_id: The user's unique identifier

        Returns:
            List of chunks with text and metadata, sorted by chunk_index
        """
        dummy_vector = [0.0] * COHERE_EMBED_DIMENSION
        results = self.index.query(
            vector=dummy_vector,
            top_k=10000,
            include_metadata=True,
            filter={
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"source": {"$eq": source_name}}
                ]
            }
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
        # Fetch the target chunk
        try:
            result = self.index.fetch(ids=[chunk_id])
        except Exception:
            return None

        if not result.vectors or chunk_id not in result.vectors:
            return None

        vector_data = result.vectors[chunk_id]
        metadata = vector_data.metadata

        # Verify user owns this chunk
        if metadata.get("user_id") != user_id:
            return None

        source = metadata.get("source")
        chunk_index = metadata.get("chunk_index", 0)
        total_chunks = metadata.get("total_chunks", 1)
        chunk_text = metadata.get("text", "")

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
