from typing import List, Dict, Any
import tiktoken
from backend.config import CHUNK_SIZE, CHUNK_OVERLAP


class Chunker:
    """Split documents into token-based chunks with overlap."""

    def __init__(self, chunk_size: int = CHUNK_SIZE, chunk_overlap: int = CHUNK_OVERLAP):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.encoder = tiktoken.get_encoding("cl100k_base")

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        return len(self.encoder.encode(text))

    def _split_text(self, text: str) -> List[str]:
        """Split text into chunks based on token count."""
        tokens = self.encoder.encode(text)

        if len(tokens) <= self.chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(tokens):
            end = start + self.chunk_size
            chunk_tokens = tokens[start:end]
            chunk_text = self.encoder.decode(chunk_tokens)
            chunks.append(chunk_text)

            # Move start position, accounting for overlap
            start = end - self.chunk_overlap

        return chunks

    def chunk_documents(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Split documents into chunks while preserving metadata.

        Args:
            documents: List of dicts with 'text' and metadata

        Returns:
            List of chunked documents with preserved metadata
        """
        chunked_docs = []

        for doc in documents:
            text = doc.get("text", "")
            chunks = self._split_text(text)

            for i, chunk in enumerate(chunks):
                chunked_doc = {
                    "text": chunk,
                    "source": doc.get("source", "unknown"),
                    "source_type": doc.get("source_type", "unknown"),
                    "page": doc.get("page"),
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "token_count": self._count_tokens(chunk)
                }
                # Preserve any additional metadata
                for key in doc:
                    if key not in chunked_doc:
                        chunked_doc[key] = doc[key]

                chunked_docs.append(chunked_doc)

        return chunked_docs
