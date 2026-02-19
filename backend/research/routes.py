"""FastAPI router for research endpoints. SSE streaming for progress."""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.articles import database as articles_db
from backend.articles.structurer import structure_to_html

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/research", tags=["research"])


def _get_components():
    """Import get_components at call time to avoid circular import with main.py."""
    from backend.main import get_components
    return get_components()


class ResearchRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=500)
    project_slug: Optional[str] = None
    quality: Optional[str] = "standard"  # "quick", "standard", "deep"


@router.post("/stream")
async def stream_research(
    request: ResearchRequest,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Start a deep research session with SSE progress updates.

    SSE event types:
    - {"type": "progress", "phase": "...", "step": N, "total": N, "message": "..."}
    - {"type": "complete", "slug": "...", "title": "...", "word_count": N}
    - {"type": "error", "message": "..."}
    """
    groq_api_key = http_request.headers.get("x-groq-api-key")
    tavily_api_key = http_request.headers.get("x-tavily-api-key")
    user_id = current_user["user_id"]

    # Resolve project_slug to project_id if provided
    project_id = None
    if request.project_slug:
        from backend.projects import database as projects_db
        project_id = await projects_db.get_project_id_by_slug(
            request.project_slug, user_id
        )
        if project_id is None:
            raise HTTPException(status_code=404, detail="Project not found")

    async def event_stream():
        progress_queue = asyncio.Queue()

        def progress_callback(phase, step, total, message):
            """Synchronous callback from the pipeline thread."""
            progress_queue.put_nowait({
                "type": "progress",
                "phase": phase,
                "step": step,
                "total": total,
                "message": message,
            })

        async def run_pipeline():
            try:
                from backend.research.agent import run_research_pipeline

                # Get query engine for PKB search (knowledge flywheel)
                components = _get_components()
                qe = components.get("query_engine")
                user_id_str = str(user_id)

                # Run the synchronous pipeline in a thread
                result = await asyncio.to_thread(
                    run_research_pipeline,
                    topic=request.topic,
                    groq_api_key=groq_api_key,
                    tavily_api_key=tavily_api_key,
                    quality=request.quality or "standard",
                    progress_callback=progress_callback,
                    query_engine=qe,
                    user_id=user_id_str,
                )

                # Phase 5: Store in knowledge base
                await progress_queue.put({
                    "type": "progress",
                    "phase": "storing",
                    "step": 5,
                    "total": 5,
                    "message": "Storing in knowledge base...",
                })

                # Chunk and store in vector DB
                doc_meta = {
                    "text": result["content_markdown"],
                    "source": result["title"],
                    "source_type": "article",
                    "article_slug": result["slug"],
                }
                if project_id is not None:
                    doc_meta["project_id"] = project_id

                chunks = components["chunker"].chunk_documents([doc_meta])
                user_id_str = str(user_id)
                doc_ids = components["vector_store"].add_documents(
                    chunks, user_id=user_id_str
                )

                # Update BM25 index
                bm25 = components.get("bm25_index")
                if bm25 is not None:
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
                    bm25.add_chunks(bm25_items)
                    bm25.save()

                # Generate HTML for display (may be slow for long articles)
                content_html = await asyncio.to_thread(
                    structure_to_html,
                    result["content_markdown"],
                    result["title"],
                    groq_api_key,
                )

                # Save to SQLite
                await articles_db.insert_article(
                    slug=result["slug"],
                    title=result["title"],
                    tags=result["tags"],
                    source="research",
                    content_markdown=result["content_markdown"],
                    user_id=user_id,
                    chunks_count=len(chunks),
                    conversation_length=0,
                    project_id=project_id,
                    content_html=content_html,
                )

                await progress_queue.put({
                    "type": "complete",
                    "slug": result["slug"],
                    "title": result["title"],
                    "word_count": result["word_count"],
                    "sources_count": result["sources_count"],
                    "pkb_sources_count": result.get("pkb_sources_count", 0),
                    "web_sources_count": result.get("web_sources_count", 0),
                    "sections_count": result["sections_count"],
                })

            except Exception as e:
                logger.exception("Research pipeline failed: %s", e)
                await progress_queue.put({
                    "type": "error",
                    "message": str(e),
                })

        # Launch pipeline as background task
        task = asyncio.create_task(run_pipeline())

        while True:
            event = await progress_queue.get()
            yield f"data: {json.dumps(event)}\n\n"

            if event["type"] in ("complete", "error"):
                break

        await task  # Ensure cleanup

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
