"""FastAPI router for article endpoints. Thin layer — delegates to publisher and database."""

from fastapi import APIRouter, HTTPException, Depends, Request

from backend.auth import get_current_user, get_optional_user
from backend.articles.models import PublishRequest, PublishResponse
from backend.articles import database as db
from backend.articles.publisher import publish_article, delete_article_vectors
from backend.articles.structurer import structure_to_html

router = APIRouter(prefix="/api", tags=["articles"])


def _get_components():
    """Import get_components at call time to avoid circular import with main.py."""
    from backend.main import get_components
    return get_components()


@router.post("/publish", response_model=PublishResponse)
async def publish_conversation(
    request: PublishRequest,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Convert a conversation into a structured article and store it."""
    components = _get_components()
    groq_api_key = http_request.headers.get("x-groq-api-key")

    # Resolve project_slug to project_id
    project_id = None
    if request.project_slug:
        from backend.projects import database as projects_db
        project_id = await projects_db.get_project_id_by_slug(
            request.project_slug, current_user["user_id"]
        )
        if project_id is None:
            raise HTTPException(status_code=404, detail="Project not found")

    try:
        result = publish_article(
            title=request.title,
            tags=request.tags,
            source=request.source,
            conversation=[m.model_dump() for m in request.conversation],
            user_id=current_user["user_id"],
            chunker=components["chunker"],
            vector_store=components["vector_store"],
            bm25_index=components.get("bm25_index"),
            update_slug=request.update_slug,
            groq_api_key=groq_api_key,
            project_id=project_id,
        )

        # Save to SQLite
        if request.update_slug:
            await db.update_article(
                slug=result["slug"],
                title=request.title,
                tags=request.tags,
                content_markdown=result["structured_content"],
                chunks_count=result["chunks_count"],
                conversation_length=result["conversation_length"],
                content_html=result.get("content_html"),
            )
        else:
            await db.insert_article(
                slug=result["slug"],
                title=request.title,
                tags=request.tags,
                source=request.source,
                content_markdown=result["structured_content"],
                user_id=current_user["user_id"],
                chunks_count=result["chunks_count"],
                conversation_length=result["conversation_length"],
                project_id=project_id,
                content_html=result.get("content_html"),
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Publishing failed: {str(e)}")

    return PublishResponse(
        success=True,
        slug=result["slug"],
        chunks_created=result["chunks_count"],
    )


@router.get("/articles")
async def list_articles(current_user: dict = Depends(get_optional_user)):
    """List all published articles."""
    user_id = current_user["user_id"] if current_user else None
    articles = await db.get_all_articles(user_id=user_id)
    return {"articles": articles}


@router.get("/articles/{slug}")
async def get_article_detail(
    slug: str,
    current_user: dict = Depends(get_optional_user),
):
    """Get a single article with full content."""
    user_id = current_user["user_id"] if current_user else None
    article = await db.get_article_by_slug(slug, user_id=user_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.put("/articles/{slug}", response_model=PublishResponse)
async def update_article(
    slug: str,
    request: PublishRequest,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Update an existing article with new conversation content."""
    # Verify article exists
    existing = await db.get_article_by_slug(slug, user_id=current_user["user_id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Article not found")

    components = _get_components()
    groq_api_key = http_request.headers.get("x-groq-api-key")

    # Delete old vectors first
    try:
        delete_article_vectors(
            title=existing["title"],
            vector_store=components["vector_store"],
            user_id=current_user["user_id"],
        )
    except Exception:
        pass  # Best effort — old vectors may already be gone

    # Re-publish with update_slug
    try:
        result = publish_article(
            title=request.title,
            tags=request.tags,
            source=request.source,
            conversation=[m.model_dump() for m in request.conversation],
            user_id=current_user["user_id"],
            chunker=components["chunker"],
            vector_store=components["vector_store"],
            bm25_index=components.get("bm25_index"),
            update_slug=slug,
            groq_api_key=groq_api_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")

    await db.update_article(
        slug=slug,
        title=request.title,
        tags=request.tags,
        content_markdown=result["structured_content"],
        chunks_count=result["chunks_count"],
        conversation_length=result["conversation_length"],
        content_html=result.get("content_html"),
    )

    return PublishResponse(
        success=True,
        slug=slug,
        chunks_created=result["chunks_count"],
    )


@router.delete("/articles/{slug}")
async def delete_article_endpoint(
    slug: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete an article and its vector embeddings."""
    # Get article title for Pinecone deletion
    title = await db.get_article_title_by_slug(slug)
    if not title:
        raise HTTPException(status_code=404, detail="Article not found")

    # Delete from Pinecone
    components = _get_components()
    try:
        delete_article_vectors(
            title=title,
            vector_store=components["vector_store"],
            user_id=current_user["user_id"],
        )
    except Exception:
        pass  # Best effort

    # Delete from SQLite
    deleted = await db.delete_article(slug, current_user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Article not found")

    return {"success": True, "message": f"Article '{slug}' deleted"}


@router.post("/publish/web-article", response_model=PublishResponse)
async def publish_web_article(
    http_request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Publish a web article extracted via Readability.js."""
    from backend.projects.models import WebArticlePublishRequest
    from backend.articles.publisher import publish_web_article

    body = await http_request.json()
    request = WebArticlePublishRequest(**body)

    components = _get_components()
    groq_api_key = http_request.headers.get("x-groq-api-key")

    # Resolve project_slug to project_id
    project_id = None
    if request.project_slug:
        from backend.projects import database as projects_db
        project_id = await projects_db.get_project_id_by_slug(
            request.project_slug, current_user["user_id"]
        )
        if project_id is None:
            raise HTTPException(status_code=404, detail="Project not found")

    try:
        result = publish_web_article(
            title=request.title,
            content=request.content,
            url=request.url,
            tags=request.tags,
            user_id=current_user["user_id"],
            chunker=components["chunker"],
            vector_store=components["vector_store"],
            bm25_index=components.get("bm25_index"),
            groq_api_key=groq_api_key,
            project_id=project_id,
        )

        # Save to SQLite
        await db.insert_article(
            slug=result["slug"],
            title=request.title,
            tags=request.tags,
            source="web",
            content_markdown=result["structured_content"],
            user_id=current_user["user_id"],
            chunks_count=result["chunks_count"],
            conversation_length=0,
            project_id=project_id,
            content_html=result.get("content_html"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Publishing failed: {str(e)}")

    return PublishResponse(
        success=True,
        slug=result["slug"],
        chunks_created=result["chunks_count"],
    )


@router.post("/articles/{slug}/reprocess")
async def reprocess_article_html(
    slug: str,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Re-generate HTML content for an existing article using the LLM."""
    article = await db.get_article_by_slug(slug, user_id=current_user["user_id"])
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    groq_api_key = http_request.headers.get("x-groq-api-key")
    raw_text = article["content_markdown"]

    try:
        content_html = structure_to_html(raw_text, article["title"], groq_api_key=groq_api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reprocessing failed: {str(e)}")

    await db.update_article_html(slug, content_html)

    return {"success": True, "slug": slug, "content_html_length": len(content_html)}


@router.post("/articles/reprocess-all")
async def reprocess_all_articles(
    http_request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Re-generate HTML for all articles missing content_html."""
    import time

    groq_api_key = http_request.headers.get("x-groq-api-key")
    articles = await db.get_articles_without_html(current_user["user_id"])
    results = []

    for article in articles:
        try:
            content_html = structure_to_html(
                article["content_markdown"], article["title"],
                groq_api_key=groq_api_key,
            )
            await db.update_article_html(article["slug"], content_html)
            results.append({"slug": article["slug"], "status": "success"})
        except Exception as e:
            results.append({"slug": article["slug"], "status": "error", "detail": str(e)})
        time.sleep(2)  # Rate limit buffer between Groq API calls

    return {"processed": len(results), "results": results}
