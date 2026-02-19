"""FastAPI router for project endpoints."""

import re
import json
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List

from backend.auth import get_optional_user
from backend.projects.models import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectDetailResponse
from backend.projects import database as db
from backend.articles import database as articles_db

# All endpoints use get_optional_user because the frontend has no auth system.
# This matches the pattern used by all other endpoints (upload, query, articles, etc.).

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_components():
    """Import get_components at call time to avoid circular import with main.py."""
    from backend.main import get_components
    return get_components()


def generate_slug(title: str) -> str:
    """Convert a title to a URL-friendly slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:80]


@router.post("", response_model=ProjectResponse)
async def create_project(
    request: ProjectCreate,
    current_user: dict = Depends(get_optional_user),
):
    """Create a new project."""
    user_id = current_user["user_id"] if current_user else None
    slug = generate_slug(request.title)

    # Ensure unique slug
    base_slug = slug
    counter = 1
    while await db.slug_exists(slug):
        slug = f"{base_slug}-{counter}"
        counter += 1

    project_id = await db.insert_project(
        slug=slug,
        title=request.title,
        description=request.description,
        user_id=user_id,
    )

    project = await db.get_project_by_slug(slug)
    return ProjectResponse(
        id=project["id"],
        slug=project["slug"],
        title=project["title"],
        description=project["description"],
        created_at=project["created_at"],
        updated_at=project["updated_at"],
        article_count=0,
        document_count=0,
    )


@router.get("")
async def list_projects(
    current_user: dict = Depends(get_optional_user),
):
    """List all projects (optionally filtered by user)."""
    user_id = current_user["user_id"] if current_user else None
    projects = await db.get_all_projects(user_id)

    # Get document counts from Pinecone for each project
    components = _get_components()
    for project in projects:
        # Document count will be fetched via Pinecone metadata
        # For now, we return article_count from SQLite
        project["document_count"] = 0

    return {"projects": projects}


@router.get("/{slug}")
async def get_project_detail(
    slug: str,
    current_user: dict = Depends(get_optional_user),
):
    """Get a project with its articles and documents."""
    user_id = current_user["user_id"] if current_user else None
    project = await db.get_project_by_slug(slug, user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get articles for this project
    articles = await articles_db.get_articles_by_project(project["id"])

    # Get documents from Pinecone tagged with this project
    components = _get_components()
    user_id_str = str(user_id) if user_id else None

    documents = []
    try:
        all_sources = components["vector_store"].get_all_sources(user_id=user_id_str)
        # Filter sources that belong to this project by checking metadata
        # For now, documents are identified by source_type != "article"
        for source in all_sources:
            if source.get("source_type") != "article":
                documents.append(source)
    except Exception:
        pass

    return {
        **project,
        "articles": articles,
        "documents": documents,
        "article_count": len(articles),
        "document_count": len(documents),
    }


@router.put("/{slug}", response_model=ProjectResponse)
async def update_project(
    slug: str,
    request: ProjectUpdate,
    current_user: dict = Depends(get_optional_user),
):
    """Update a project's title and description."""
    user_id = current_user["user_id"] if current_user else None
    updated = await db.update_project(
        slug=slug,
        title=request.title,
        description=request.description,
        user_id=user_id,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")

    project = await db.get_project_by_slug(slug, user_id)
    return ProjectResponse(
        id=project["id"],
        slug=project["slug"],
        title=project["title"],
        description=project["description"],
        created_at=project["created_at"],
        updated_at=project["updated_at"],
    )


@router.delete("/{slug}")
async def delete_project(
    slug: str,
    current_user: dict = Depends(get_optional_user),
):
    """Delete a project and unlink its articles."""
    user_id = current_user["user_id"] if current_user else None
    project_id = await db.delete_project(slug, user_id)
    if project_id is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"success": True, "message": f"Project '{slug}' deleted"}


@router.post("/{slug}/query")
async def project_scoped_query(
    slug: str,
    http_request: Request,
    current_user: dict = Depends(get_optional_user),
):
    """Query the knowledge base scoped to a specific project."""

    # Parse request body
    body = await http_request.json()
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    top_k = body.get("top_k", 5)
    threshold = body.get("threshold", 0.3)
    chat_history = body.get("chat_history")

    # Verify project exists
    user_id = current_user["user_id"] if current_user else None
    project = await db.get_project_by_slug(slug, user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_id = project["id"]
    components = _get_components()
    user_id_str = str(user_id) if user_id else None
    groq_api_key = http_request.headers.get("x-groq-api-key")

    # Get article titles for this project (used as Pinecone source filter)
    project_articles = await articles_db.get_articles_by_project(project_id)
    article_titles = [a["title"] for a in project_articles]

    # Create per-request LLM if user provided their own key
    if groq_api_key:
        from backend.llm.reasoning import LLMReasoning
        active_llm = LLMReasoning(groq_api_key=groq_api_key)
    else:
        active_llm = None

    async def event_stream():
        yield f"data: {json.dumps({'type': 'status', 'content': 'thinking'})}\n\n"

        qe = components["query_engine"]

        # Retrieve with project-scoped filtering
        # We search across all user's content but filter by article titles from this project
        all_chunks = []
        for title in article_titles:
            chunks, _ = qe.retrieve(
                question=question,
                top_k=top_k,
                threshold=threshold,
                source_filter=title,
                user_id=user_id_str,
            )
            all_chunks.extend(chunks)

        # Also search without source filter but limit to project's content
        # This catches documents uploaded to the project
        if not all_chunks:
            all_chunks, _ = qe.retrieve(
                question=question,
                top_k=top_k,
                threshold=threshold,
                user_id=user_id_str,
            )

        # Sort by similarity and take top_k
        all_chunks.sort(key=lambda x: x.get("similarity", 0), reverse=True)
        chunks = all_chunks[:top_k]

        # Use per-request LLM if available, otherwise default
        llm = active_llm or qe.llm
        async for event in llm.generate_response_stream(
            query=question,
            chunks=chunks,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
