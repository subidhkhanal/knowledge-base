"""FastAPI router for article endpoints. Thin layer — delegates to publisher and database."""

from fastapi import APIRouter, HTTPException, Depends, Request

from backend.auth import get_current_user
from backend.articles import database as db
from backend.articles.publisher import delete_article_vectors
from backend.articles.structurer import structure_to_html

router = APIRouter(prefix="/api", tags=["articles"])


def _get_components():
    """Import get_components at call time to avoid circular import with main.py."""
    from backend.main import get_components
    return get_components()


@router.get("/articles")
async def list_articles(current_user: dict = Depends(get_current_user)):
    """List all published articles."""
    user_id = current_user["user_id"]
    articles = await db.get_all_articles(user_id=user_id)
    return {"articles": articles}


@router.get("/articles/{slug}")
async def get_article_detail(
    slug: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single article with full content."""
    user_id = current_user["user_id"]
    article = await db.get_article_by_slug(slug, user_id=user_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.delete("/articles/{slug}")
async def delete_article_endpoint(
    slug: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete an article and its vector embeddings."""
    # Get article title for Pinecone deletion
    title = await db.get_article_title_by_slug(slug, user_id=current_user["user_id"])
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

    # Delete from database
    deleted = await db.delete_article(slug, current_user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Article not found")

    return {"success": True, "message": f"Article '{slug}' deleted"}


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

    await db.update_article_html(slug, content_html, user_id=current_user["user_id"])

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
            await db.update_article_html(article["slug"], content_html, user_id=current_user["user_id"])
            results.append({"slug": article["slug"], "status": "success"})
        except Exception as e:
            results.append({"slug": article["slug"], "status": "error", "detail": str(e)})
        time.sleep(2)  # Rate limit buffer between Groq API calls

    return {"processed": len(results), "results": results}
