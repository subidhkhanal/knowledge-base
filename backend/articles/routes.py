"""FastAPI router for article endpoints. Thin layer — delegates to publisher and database."""

from fastapi import APIRouter, HTTPException, Depends

from backend.auth import get_current_user, get_optional_user
from backend.articles.models import PublishRequest, PublishResponse
from backend.articles import database as db
from backend.articles.publisher import publish_article, delete_article_vectors

router = APIRouter(prefix="/api", tags=["articles"])


def _get_components():
    """Import get_components at call time to avoid circular import with main.py."""
    from backend.main import get_components
    return get_components()


@router.post("/publish", response_model=PublishResponse)
async def publish_conversation(
    request: PublishRequest,
    current_user: dict = Depends(get_current_user),
):
    """Convert a conversation into a structured article and store it."""
    components = _get_components()

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
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Publishing failed: {str(e)}")

    # Save to SQLite
    if request.update_slug:
        await db.update_article(
            slug=result["slug"],
            title=request.title,
            tags=request.tags,
            content_markdown=result["structured_content"],
            chunks_count=result["chunks_count"],
            conversation_length=result["conversation_length"],
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
        )

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
    current_user: dict = Depends(get_current_user),
):
    """Update an existing article with new conversation content."""
    # Verify article exists
    existing = await db.get_article_by_slug(slug, user_id=current_user["user_id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Article not found")

    components = _get_components()

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
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")

    await db.update_article(
        slug=slug,
        title=request.title,
        tags=request.tags,
        content_markdown=result["structured_content"],
        chunks_count=result["chunks_count"],
        conversation_length=result["conversation_length"],
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
