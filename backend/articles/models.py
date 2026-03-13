"""Pydantic request/response schemas for the articles module."""

from pydantic import BaseModel, Field
from typing import List, Optional


class ArticleListItem(BaseModel):
    """Lightweight article metadata for listing."""
    slug: str
    title: str
    tags: List[str]
    source: str
    chunks_count: int
    conversation_length: int
    created_at: str
    updated_at: str


class ArticleDetail(BaseModel):
    """Full article with markdown and/or HTML content."""
    slug: str
    title: str
    tags: List[str]
    source: str
    content_markdown: str
    content_html: Optional[str] = None
    chunks_count: int
    conversation_length: int
    created_at: str
    updated_at: str
