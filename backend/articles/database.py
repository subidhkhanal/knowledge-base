"""SQLite CRUD operations for the articles table."""

import json
from typing import Optional, List, Dict, Any
from backend.auth.database import get_db


async def create_articles_table():
    """Create the articles table if it doesn't exist. Called from init_db()."""
    db = await get_db()
    try:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                tags_json TEXT DEFAULT '[]',
                source TEXT NOT NULL,
                content_markdown TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                project_id INTEGER,
                chunks_count INTEGER DEFAULT 0,
                conversation_length INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id);
            CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
        """)
        await db.commit()

        # Add project_id column if it doesn't exist (migration for existing DBs)
        try:
            await db.execute("ALTER TABLE articles ADD COLUMN project_id INTEGER REFERENCES projects(id)")
            await db.commit()
        except Exception:
            pass  # Column already exists

        # Add content_html column if it doesn't exist (migration for existing DBs)
        try:
            await db.execute("ALTER TABLE articles ADD COLUMN content_html TEXT")
            await db.commit()
        except Exception:
            pass  # Column already exists

        # Create project_id index after migration ensures the column exists
        await db.executescript("""
            CREATE INDEX IF NOT EXISTS idx_articles_project ON articles(project_id);
        """)
        await db.commit()
    finally:
        await db.close()


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
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO articles
               (slug, title, tags_json, source, content_markdown, content_html, user_id, project_id, chunks_count, conversation_length)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (slug, title, json.dumps(tags), source, content_markdown, content_html,
             user_id, project_id, chunks_count, conversation_length),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_all_articles(user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Get all articles (metadata only, no full content)."""
    db = await get_db()
    try:
        if user_id:
            rows = await db.execute_fetchall(
                """SELECT slug, title, tags_json, source, chunks_count,
                          conversation_length, created_at, updated_at, project_id
                   FROM articles WHERE user_id = ? ORDER BY created_at DESC""",
                (user_id,),
            )
        else:
            rows = await db.execute_fetchall(
                """SELECT slug, title, tags_json, source, chunks_count,
                          conversation_length, created_at, updated_at, project_id
                   FROM articles ORDER BY created_at DESC"""
            )
        return [_row_to_list_item(r) for r in rows]
    finally:
        await db.close()


async def get_articles_by_project(project_id: int) -> List[Dict[str, Any]]:
    """Get all articles belonging to a specific project."""
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            """SELECT slug, title, tags_json, source, chunks_count,
                      conversation_length, created_at, updated_at, project_id
               FROM articles WHERE project_id = ? ORDER BY created_at DESC""",
            (project_id,),
        )
        return [_row_to_list_item(r) for r in rows]
    finally:
        await db.close()


async def get_article_by_slug(slug: str, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Get a single article with full content."""
    db = await get_db()
    try:
        if user_id:
            rows = await db.execute_fetchall(
                """SELECT slug, title, tags_json, source, content_markdown,
                          chunks_count, conversation_length, created_at, updated_at, project_id, content_html
                   FROM articles WHERE slug = ? AND user_id = ?""",
                (slug, user_id),
            )
        else:
            rows = await db.execute_fetchall(
                """SELECT slug, title, tags_json, source, content_markdown,
                          chunks_count, conversation_length, created_at, updated_at, project_id, content_html
                   FROM articles WHERE slug = ?""",
                (slug,),
            )
        if not rows:
            return None
        r = rows[0]
        return {
            "slug": r[0], "title": r[1], "tags": json.loads(r[2]),
            "source": r[3], "content_markdown": r[4], "chunks_count": r[5],
            "conversation_length": r[6], "created_at": r[7], "updated_at": r[8],
            "project_id": r[9], "content_html": r[10] if len(r) > 10 else None,
        }
    finally:
        await db.close()


async def update_article(
    slug: str, title: str, tags: List[str],
    content_markdown: str, chunks_count: int, conversation_length: int,
    content_html: Optional[str] = None,
) -> bool:
    """Update an existing article. Returns True if updated."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """UPDATE articles
               SET title = ?, tags_json = ?, content_markdown = ?, content_html = ?,
                   chunks_count = ?, conversation_length = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE slug = ?""",
            (title, json.dumps(tags), content_markdown, content_html,
             chunks_count, conversation_length, slug),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def delete_article(slug: str, user_id: int) -> bool:
    """Delete an article by slug. Returns True if deleted."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "DELETE FROM articles WHERE slug = ? AND user_id = ?",
            (slug, user_id),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def get_article_title_by_slug(slug: str) -> Optional[str]:
    """Get just the title for a given slug. Used for Pinecone source deletion."""
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            "SELECT title FROM articles WHERE slug = ?", (slug,)
        )
        return rows[0][0] if rows else None
    finally:
        await db.close()


async def update_article_html(slug: str, content_html: str) -> bool:
    """Update only the HTML content for an article (for reprocessing)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "UPDATE articles SET content_html = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?",
            (content_html, slug),
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def get_articles_without_html(user_id: int) -> List[Dict[str, Any]]:
    """Get all articles that have no content_html (for bulk reprocessing)."""
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            """SELECT slug, title, content_markdown
               FROM articles WHERE user_id = ? AND (content_html IS NULL OR content_html = '')
               ORDER BY created_at DESC""",
            (user_id,),
        )
        return [{"slug": r[0], "title": r[1], "content_markdown": r[2]} for r in rows]
    finally:
        await db.close()


def _row_to_list_item(r) -> Dict[str, Any]:
    """Convert a raw SQLite row to an article list item dict."""
    return {
        "slug": r[0], "title": r[1], "tags": json.loads(r[2]),
        "source": r[3], "chunks_count": r[4], "conversation_length": r[5],
        "created_at": r[6], "updated_at": r[7],
        "project_id": r[8] if len(r) > 8 else None,
    }
