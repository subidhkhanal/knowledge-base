"""Pydantic request/response schemas for the projects module."""

from pydantic import BaseModel, Field
from typing import List, Optional


class ProjectCreate(BaseModel):
    """Request body for creating a project."""
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)


class ProjectUpdate(BaseModel):
    """Request body for updating a project."""
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)


class ProjectResponse(BaseModel):
    """Single project response."""
    id: int
    slug: str
    title: str
    description: str
    created_at: str
    updated_at: str
    article_count: int = 0
    document_count: int = 0


class ProjectDetailResponse(ProjectResponse):
    """Project detail with articles and documents."""
    articles: List[dict] = []
    documents: List[dict] = []


class WebArticlePublishRequest(BaseModel):
    """Request body for publishing a web article via Readability.js."""
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)
    tags: List[str] = Field(default_factory=list)
    project_slug: Optional[str] = None
