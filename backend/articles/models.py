"""Pydantic request/response schemas for the articles module."""

from pydantic import BaseModel, Field
from typing import List, Optional


class MessageInput(BaseModel):
    """A single message in a conversation."""
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., min_length=1)


class PublishRequest(BaseModel):
    """Request body for publishing a conversation as an article."""
    title: str = Field(..., min_length=1, max_length=200)
    tags: List[str] = Field(default_factory=list)
    source: str = Field(..., description="'claude' or 'chatgpt'")
    conversation: List[MessageInput] = Field(..., min_length=1)
    update_slug: Optional[str] = None
    project_slug: Optional[str] = None


class PublishResponse(BaseModel):
    """Response after successfully publishing an article."""
    success: bool
    slug: str
    chunks_created: int


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
