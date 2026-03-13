"""FastAPI router for project endpoints."""

import re
import json
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List

from backend.auth import get_current_user
from backend.projects.models import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectDetailResponse
from backend.projects import database as db
from backend.articles import database as articles_db
from backend.documents import database as documents_db

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
    current_user: dict = Depends(get_current_user),
):
    """Create a new project."""
    user_id = current_user["user_id"]
    slug = generate_slug(request.title)

    # Ensure unique slug
    base_slug = slug
    counter = 1
    while await db.slug_exists(slug, user_id):
        slug = f"{base_slug}-{counter}"
        counter += 1

    project_id = await db.insert_project(
        slug=slug,
        title=request.title,
        description=request.description,
        user_id=user_id,
    )

    project = await db.get_project_by_slug(slug, user_id)
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
    current_user: dict = Depends(get_current_user),
):
    """List all projects for the current user."""
    user_id = current_user["user_id"]
    projects = await db.get_all_projects(user_id)

    components = _get_components()
    for project in projects:
        project["document_count"] = 0

    return {"projects": projects}


@router.get("/{slug}")
async def get_project_detail(
    slug: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a project with its articles and documents."""
    user_id = current_user["user_id"]
    project = await db.get_project_by_slug(slug, user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get articles for this project
    articles = await articles_db.get_articles_by_project(project["id"], user_id=user_id)

    # Get documents from Pinecone tagged with this project
    components = _get_components()
    user_id_str = str(user_id)

    documents = []
    try:
        all_sources = components["vector_store"].get_all_sources(user_id=user_id_str)
        for source in all_sources:
            if source.get("source_type") != "article" and source.get("project_id") == project["id"]:
                documents.append(source)
    except Exception:
        pass

    # Enrich documents with document_id from DB for reader links
    sqlite_docs = await documents_db.get_documents_by_project(project["id"], user_id=user_id)
    doc_id_map = {d["filename"]: d["id"] for d in sqlite_docs}
    for doc in documents:
        doc["document_id"] = doc_id_map.get(doc.get("source"))

    # Add any DB documents not yet in Pinecone
    existing_sources = {d.get("source") for d in documents}
    for sd in sqlite_docs:
        if sd["filename"] not in existing_sources:
            documents.append({
                "source": sd["filename"],
                "source_type": sd["extension"].lstrip("."),
                "chunk_count": 0,
                "document_id": sd["id"],
            })

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
    current_user: dict = Depends(get_current_user),
):
    """Update a project's title and description."""
    user_id = current_user["user_id"]
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
    current_user: dict = Depends(get_current_user),
):
    """Delete a project and unlink its articles."""
    user_id = current_user["user_id"]
    project_id = await db.delete_project(slug, user_id)
    if project_id is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"success": True, "message": f"Project '{slug}' deleted"}


@router.post("/{slug}/query")
async def project_scoped_query(
    slug: str,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Query the knowledge base scoped to a specific project."""

    body = await http_request.json()
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    top_k = body.get("top_k", 5)
    threshold = body.get("threshold", 0.3)
    chat_history = body.get("chat_history")

    user_id = current_user["user_id"]
    project = await db.get_project_by_slug(slug, user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_id = project["id"]
    components = _get_components()

    project_articles = await articles_db.get_articles_by_project(project_id, user_id=user_id)
    project_documents = await documents_db.get_documents_by_project(project_id, user_id=user_id)
    source_names = [a["title"] for a in project_articles] + [d["filename"] for d in project_documents]

    async def event_stream():
        yield f"data: {json.dumps({'type': 'status', 'content': 'thinking'})}\n\n"

        # Query routing: handle non-retrieval routes (GREETING, META, etc.)
        from backend.config import ENABLE_QUERY_ROUTING
        from backend.routing.query_router import RouteType
        query_router = components.get("query_router")
        rh = components.get("route_handlers")
        effective_query = question

        if ENABLE_QUERY_ROUTING and query_router and rh:
            route_result = await query_router.classify(question)
            route_type = route_result.route_type

            # Non-retrieval routes: GREETING, CLARIFICATION, OUT_OF_SCOPE
            if route_type in (RouteType.GREETING, RouteType.CLARIFICATION, RouteType.OUT_OF_SCOPE):
                async for event in rh.handle_stream(
                    route_type=route_type,
                    query=question,
                    rewritten_query=route_result.rewritten_query,
                ):
                    yield f"data: {json.dumps(event)}\n\n"
                return

            # META: list this project's documents specifically
            if route_type == RouteType.META:
                if source_names:
                    doc_list = "\n".join(f"- {name}" for name in source_names)
                    answer = f"This project has {len(source_names)} document(s):\n\n{doc_list}\n\nYou can ask me questions about any of these!"
                else:
                    answer = "This project doesn't have any documents yet. Upload some to get started!"
                yield f"data: {json.dumps({'type': 'token', 'content': answer})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'sources': [], 'chunks_used': 0, 'provider': 'system', 'route_type': 'META'})}\n\n"
                return

            # KNOWLEDGE, SUMMARY, COMPARISON, FOLLOW_UP: use rewritten query for retrieval
            effective_query = route_result.rewritten_query or question

        qe = components["query_engine"]

        all_chunks = []
        for name in source_names:
            chunks, _ = qe.retrieve(
                question=effective_query,
                top_k=top_k,
                threshold=threshold,
                source_filter=name,
            )
            all_chunks.extend(chunks)

        all_chunks.sort(key=lambda x: x.get("similarity", 0), reverse=True)
        chunks = all_chunks[:top_k]

        try:
            async for event in qe.llm.generate_response_stream(
                query=effective_query,
                chunks=chunks,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': f'LLM error: {str(e)}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'sources': [], 'chunks_used': 0})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
