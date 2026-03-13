"""
Article utilities: slug generation and vector cleanup.
"""

import re
import time
from typing import Any


def generate_slug(title: str) -> str:
    """Convert a title to a URL-friendly slug. Appends a short timestamp suffix to ensure uniqueness."""
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:70]
    suffix = hex(int(time.time()))[2:]  # e.g. "65ab3c1f"
    return f"{base}-{suffix}"


def delete_article_vectors(
    title: str,
    vector_store: Any,
    user_id: int,
) -> int:
    """Delete all Pinecone vectors for an article (by source=title)."""
    user_id_str = str(user_id)
    return vector_store.delete_by_source(title, user_id=user_id_str)
