"""
One-time script: fetch all chunks from Pinecone and build BM25 index.
Run after deploying hybrid retrieval on an existing knowledge base.

Usage:
    python -m backend.scripts.rebuild_bm25
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.storage.vector_store import VectorStore
from backend.retrieval.bm25_index import BM25Index


def main():
    print("Initializing vector store...")
    vs = VectorStore()

    print("Fetching all sources...")
    all_sources = vs.get_all_sources()
    print(f"Found {len(all_sources)} sources")

    all_chunks = []
    for source in all_sources:
        source_name = source["source"]
        chunks = vs.get_chunks_by_source(source_name)
        print(f"  {source_name}: {len(chunks)} chunks")
        for chunk in chunks:
            all_chunks.append({
                "text": chunk["text"],
                "id": chunk["id"],
                "metadata": {
                    "source": source_name,
                    "source_type": chunk.get("source_type", "unknown"),
                }
            })

    print(f"\nBuilding BM25 index with {len(all_chunks)} total chunks...")
    bm25 = BM25Index()
    bm25.build_from_chunks(all_chunks)
    bm25.save()
    print("BM25 index saved successfully!")


if __name__ == "__main__":
    main()
