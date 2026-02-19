from typing import List, Dict, Any
import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter
from backend.config import CHUNK_SIZE, CHUNK_OVERLAP


class RecursiveChunker:
    """Hierarchical recursive text splitter: paragraphs -> sentences -> tokens."""

    def __init__(self, chunk_size: int = CHUNK_SIZE, chunk_overlap: int = CHUNK_OVERLAP):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.encoder = tiktoken.get_encoding("cl100k_base")

        self.splitter = RecursiveCharacterTextSplitter(
            separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""],
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=self._count_tokens,
            is_separator_regex=False,
        )

    def _count_tokens(self, text: str) -> int:
        return len(self.encoder.encode(text))

    def _split_text(self, text: str) -> List[str]:
        return self.splitter.split_text(text)

    def chunk_documents(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Split documents into chunks while preserving metadata.
        Same interface as Chunker.chunk_documents().
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
                    "token_count": self._count_tokens(chunk),
                    "chunking_method": "recursive"
                }
                for key in doc:
                    if key not in chunked_doc:
                        chunked_doc[key] = doc[key]

                chunked_docs.append(chunked_doc)

        return chunked_docs
