"""
Article publish pipeline orchestrator.
Coordinates: structurer → chunker → Pinecone → BM25 → SQLite.

Components (chunker, vector_store, bm25_index) are passed in from the route
layer to avoid circular imports with main.py's lazy-loading pattern.
"""

import re
from typing import List, Dict, Any, Optional

from backend.articles.structurer import structure_conversation
from backend.articles import database as db


def generate_slug(title: str) -> str:
    """Convert a title to a URL-friendly slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:80]


def publish_article(
    title: str,
    tags: List[str],
    source: str,
    conversation: List[Dict[str, str]],
    user_id: int,
    chunker: Any,
    vector_store: Any,
    bm25_index: Optional[Any] = None,
    update_slug: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full publish pipeline (synchronous LLM call, async DB handled by caller).

    Returns dict with slug, structured_content, chunks, and doc_ids
    so the async route can do the DB insert.
    """
    slug = update_slug or generate_slug(title)

    # 1. Structure conversation with LLM
    structured_content = structure_conversation(conversation, title)

    # 2. Prepare documents for the chunker (same format as upload pipeline)
    documents = [{
        "text": structured_content,
        "source": title,
        "source_type": "article",
        "article_slug": slug,
    }]

    # 3. Chunk the article
    chunks = chunker.chunk_documents(documents)

    # 4. Store chunks in Pinecone
    user_id_str = str(user_id)
    doc_ids = vector_store.add_documents(chunks, user_id=user_id_str)

    # 5. Update BM25 index for hybrid retrieval
    if bm25_index is not None:
        bm25_items = []
        for chunk, doc_id in zip(chunks, doc_ids):
            bm25_items.append({
                "text": chunk["text"],
                "id": doc_id,
                "metadata": {
                    "source": chunk.get("source", "unknown"),
                    "source_type": "article",
                    "user_id": user_id_str,
                },
            })
        bm25_index.add_chunks(bm25_items)
        bm25_index.save()

    return {
        "slug": slug,
        "structured_content": structured_content,
        "chunks_count": len(chunks),
        "conversation_length": len(conversation),
    }


def delete_article_vectors(
    title: str,
    vector_store: Any,
    user_id: int,
) -> int:
    """Delete all Pinecone vectors for an article (by source=title)."""
    user_id_str = str(user_id)
    return vector_store.delete_by_source(title, user_id=user_id_str)
