"""PostgreSQL CRUD operations for the articles table."""

import json
from typing import Optional, List, Dict, Any
from backend.db.connection import get_central_db


async def insert_article(
    slug: str,
    title: str,
    tags: List[str],
    source: str,
    content_markdown: str,
    user_id: int,
    chunks_count: int,
    conversation_length: int,
    project_id: Optional[int] = None,
    content_html: Optional[str] = None,
) -> int:
    """Insert a new article. Returns the article ID."""
    db = await get_central_db()
    try:
        result = await db.execute(
            """INSERT INTO articles
               (user_id, slug, title, tags_json, source, content_markdown, content_html, project_id, chunks_count, conversation_length)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
            user_id, slug, title, json.dumps(tags), source, content_markdown, content_html,
            project_id, chunks_count, conversation_length,
        )
        return result.lastrowid
    finally:
        await db.close()


async def get_all_articles(user_id: int) -> List[Dict[str, Any]]:
    """Get all articles (metadata only, no full content)."""
    db = await get_central_db()
    try:
        rows = await db.fetch_all(
            """SELECT slug, title, tags_json, source, chunks_count,
                      conversation_length, created_at, updated_at, project_id
               FROM articles WHERE user_id = $1 ORDER BY created_at DESC""",
            user_id,
        )
        return [_row_to_list_item(r) for r in rows]
    finally:
        await db.close()


async def get_articles_by_project(project_id: int, user_id: int) -> List[Dict[str, Any]]:
    """Get all articles belonging to a specific project."""
    db = await get_central_db()
    try:
        rows = await db.fetch_all(
            """SELECT slug, title, tags_json, source, chunks_count,
                      conversation_length, created_at, updated_at, project_id
               FROM articles WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC""",
            project_id, user_id,
        )
        return [_row_to_list_item(r) for r in rows]
    finally:
        await db.close()


async def get_article_by_slug(slug: str, user_id: int) -> Optional[Dict[str, Any]]:
    """Get a single article with full content."""
    db = await get_central_db()
    try:
        r = await db.fetch_one(
            """SELECT slug, title, tags_json, source, content_markdown,
                      chunks_count, conversation_length, created_at, updated_at, project_id, content_html
               FROM articles WHERE slug = $1 AND user_id = $2""",
            slug, user_id,
        )
        if not r:
            return None
        return {
            "slug": r["slug"], "title": r["title"], "tags": json.loads(r["tags_json"]),
            "source": r["source"], "content_markdown": r["content_markdown"],
            "chunks_count": r["chunks_count"], "conversation_length": r["conversation_length"],
            "created_at": str(r["created_at"]), "updated_at": str(r["updated_at"]),
            "project_id": r["project_id"], "content_html": r.get("content_html"),
        }
    finally:
        await db.close()


async def update_article(
    slug: str, title: str, tags: List[str],
    content_markdown: str, chunks_count: int, conversation_length: int,
    content_html: Optional[str] = None,
    user_id: int = None,
) -> bool:
    """Update an existing article. Returns True if updated."""
    db = await get_central_db()
    try:
        result = await db.execute(
            """UPDATE articles
               SET title = $1, tags_json = $2, content_markdown = $3, content_html = $4,
                   chunks_count = $5, conversation_length = $6,
                   updated_at = NOW()
               WHERE slug = $7 AND user_id = $8""",
            title, json.dumps(tags), content_markdown, content_html,
            chunks_count, conversation_length, slug, user_id,
        )
        return result.rowcount > 0
    finally:
        await db.close()


async def delete_article(slug: str, user_id: int) -> bool:
    """Delete an article by slug. Returns True if deleted."""
    db = await get_central_db()
    try:
        result = await db.execute(
            "DELETE FROM articles WHERE slug = $1 AND user_id = $2",
            slug, user_id,
        )
        return result.rowcount > 0
    finally:
        await db.close()


async def get_article_title_by_slug(slug: str, user_id: int) -> Optional[str]:
    """Get just the title for a given slug. Used for Pinecone source deletion."""
    db = await get_central_db()
    try:
        row = await db.fetch_one(
            "SELECT title FROM articles WHERE slug = $1 AND user_id = $2", slug, user_id
        )
        return row["title"] if row else None
    finally:
        await db.close()


async def update_article_html(slug: str, content_html: str, user_id: int) -> bool:
    """Update only the HTML content for an article (for reprocessing)."""
    db = await get_central_db()
    try:
        result = await db.execute(
            "UPDATE articles SET content_html = $1, updated_at = NOW() WHERE slug = $2 AND user_id = $3",
            content_html, slug, user_id,
        )
        return result.rowcount > 0
    finally:
        await db.close()


async def get_articles_without_html(user_id: int) -> List[Dict[str, Any]]:
    """Get all articles that have no content_html (for bulk reprocessing)."""
    db = await get_central_db()
    try:
        rows = await db.fetch_all(
            """SELECT slug, title, content_markdown
               FROM articles WHERE user_id = $1 AND (content_html IS NULL OR content_html = '')
               ORDER BY created_at DESC""",
            user_id,
        )
        return [{"slug": r["slug"], "title": r["title"], "content_markdown": r["content_markdown"]} for r in rows]
    finally:
        await db.close()


def _row_to_list_item(r: dict) -> Dict[str, Any]:
    """Convert a DB row dict to an article list item."""
    return {
        "slug": r["slug"], "title": r["title"], "tags": json.loads(r["tags_json"]),
        "source": r["source"], "chunks_count": r["chunks_count"],
        "conversation_length": r["conversation_length"],
        "created_at": str(r["created_at"]), "updated_at": str(r["updated_at"]),
        "project_id": r.get("project_id"),
    }
