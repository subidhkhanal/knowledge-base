import os
import pickle
import re
from typing import List, Dict, Any, Optional
from rank_bm25 import BM25Okapi
from backend.config import BASE_DIR

BM25_CACHE_DIR = str(BASE_DIR / "data" / "bm25_cache")


class BM25Index:
    """In-memory BM25 sparse retrieval index with pickle persistence."""

    def __init__(self):
        self.corpus: List[Dict[str, Any]] = []
        self.tokenized_corpus: List[List[str]] = []
        self.bm25: Optional[BM25Okapi] = None

    def _tokenize(self, text: str) -> List[str]:
        text = text.lower()
        tokens = re.findall(r'\b\w+\b', text)
        return [t for t in tokens if len(t) > 1]

    def build_from_chunks(self, chunks: List[Dict[str, Any]]):
        """Build BM25 index from chunk list."""
        self.corpus = chunks
        self.tokenized_corpus = [self._tokenize(c.get("text", "")) for c in chunks]
        if self.tokenized_corpus:
            self.bm25 = BM25Okapi(self.tokenized_corpus)

    def add_chunks(self, new_chunks: List[Dict[str, Any]]):
        """Add new chunks and rebuild index."""
        self.corpus.extend(new_chunks)
        self.tokenized_corpus.extend([self._tokenize(c.get("text", "")) for c in new_chunks])
        if self.tokenized_corpus:
            self.bm25 = BM25Okapi(self.tokenized_corpus)

    def search(self, query: str, top_k: int = 10, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search BM25 index. Returns chunks with bm25_score."""
        if not self.bm25 or not self.corpus:
            return []

        tokenized_query = self._tokenize(query)
        if not tokenized_query:
            return []

        scores = self.bm25.get_scores(tokenized_query)

        scored = []
        for i, score in enumerate(scores):
            chunk = self.corpus[i]
            if user_id and chunk.get("metadata", {}).get("user_id") != user_id:
                continue
            scored.append((score, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)

        results = []
        for score, chunk in scored[:top_k]:
            result = chunk.copy()
            result["bm25_score"] = float(score)
            results.append(result)

        return results

    def remove_by_source(self, source_name: str, user_id: Optional[str] = None):
        """Remove chunks by source and optionally user_id, then rebuild."""
        new_corpus = []
        for chunk in self.corpus:
            meta = chunk.get("metadata", {})
            if meta.get("source") == source_name:
                if user_id is None or meta.get("user_id") == user_id:
                    continue
            new_corpus.append(chunk)
        self.build_from_chunks(new_corpus)

    def save(self, filepath: str = None):
        """Persist index to pickle file."""
        filepath = filepath or os.path.join(BM25_CACHE_DIR, "bm25_index.pkl")
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "wb") as f:
            pickle.dump({"corpus": self.corpus, "tokenized": self.tokenized_corpus}, f)

    def load(self, filepath: str = None) -> bool:
        """Load index from pickle file. Returns True if successful."""
        filepath = filepath or os.path.join(BM25_CACHE_DIR, "bm25_index.pkl")
        if not os.path.exists(filepath):
            return False
        try:
            with open(filepath, "rb") as f:
                data = pickle.load(f)
            self.corpus = data["corpus"]
            self.tokenized_corpus = data["tokenized"]
            if self.tokenized_corpus:
                self.bm25 = BM25Okapi(self.tokenized_corpus)
            return True
        except Exception:
            return False

    @property
    def is_empty(self) -> bool:
        return len(self.corpus) == 0
