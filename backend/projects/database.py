"""PostgreSQL CRUD operations for the projects table."""

from typing import Optional, List, Dict, Any
from backend.db.connection import get_central_db


async def insert_project(
    slug: str,
    title: str,
    description: str,
    user_id: int,
) -> int:
    """Insert a new project. Returns the project ID."""
    db = await get_central_db()
    try:
        result = await db.execute(
            """INSERT INTO projects (user_id, slug, title, description)
               VALUES ($1, $2, $3, $4)""",
            user_id, slug, title, description,
        )
        return result.lastrowid
    finally:
        await db.close()


async def get_all_projects(user_id: int) -> List[Dict[str, Any]]:
    """Get all projects with article and document counts."""
    db = await get_central_db()
    try:
        rows = await db.fetch_all(
            """SELECT p.id, p.slug, p.title, p.description, p.created_at, p.updated_at,
                      (SELECT COUNT(*) FROM articles a WHERE a.project_id = p.id) as article_count,
                      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) as document_count
               FROM projects p
               WHERE p.user_id = $1
               ORDER BY p.updated_at DESC""",
            user_id,
        )
        return [
            {
                "id": r["id"],
                "slug": r["slug"],
                "title": r["title"],
                "description": r["description"],
                "created_at": str(r["created_at"]),
                "updated_at": str(r["updated_at"]),
                "article_count": r["article_count"],
                "document_count": r["document_count"],
            }
            for r in rows
        ]
    finally:
        await db.close()


async def get_project_by_slug(slug: str, user_id: int) -> Optional[Dict[str, Any]]:
    """Get a single project by slug."""
    db = await get_central_db()
    try:
        r = await db.fetch_one(
            """SELECT id, slug, title, description, created_at, updated_at
               FROM projects WHERE slug = $1 AND user_id = $2""",
            slug, user_id,
        )
        if not r:
            return None
        return {
            "id": r["id"],
            "slug": r["slug"],
            "title": r["title"],
            "description": r["description"],
            "created_at": str(r["created_at"]),
            "updated_at": str(r["updated_at"]),
        }
    finally:
        await db.close()


async def get_project_id_by_slug(slug: str, user_id: int) -> Optional[int]:
    """Get just the project ID for a given slug."""
    db = await get_central_db()
    try:
        row = await db.fetch_one(
            "SELECT id FROM projects WHERE slug = $1 AND user_id = $2", slug, user_id
        )
        return row["id"] if row else None
    finally:
        await db.close()


async def update_project(
    slug: str, title: str, description: str, user_id: int
) -> bool:
    """Update a project's title and description. Returns True if updated."""
    db = await get_central_db()
    try:
        result = await db.execute(
            """UPDATE projects
               SET title = $1, description = $2, updated_at = NOW()
               WHERE slug = $3 AND user_id = $4""",
            title, description, slug, user_id,
        )
        return result.rowcount > 0
    finally:
        await db.close()


async def delete_project(slug: str, user_id: int) -> Optional[int]:
    """Delete a project by slug. Returns the project ID if deleted, None otherwise."""
    db = await get_central_db()
    try:
        row = await db.fetch_one(
            "SELECT id FROM projects WHERE slug = $1 AND user_id = $2", slug, user_id
        )
        if not row:
            return None
        project_id = row["id"]

        # Unlink articles from this project
        await db.execute(
            "UPDATE articles SET project_id = NULL WHERE project_id = $1 AND user_id = $2",
            project_id, user_id,
        )
        # Delete the project
        await db.execute("DELETE FROM projects WHERE id = $1 AND user_id = $2", project_id, user_id)
        return project_id
    finally:
        await db.close()


async def slug_exists(slug: str, user_id: int) -> bool:
    """Check if a project slug already exists for this user."""
    db = await get_central_db()
    try:
        row = await db.fetch_one(
            "SELECT 1 FROM projects WHERE slug = $1 AND user_id = $2", slug, user_id
        )
        return row is not None
    finally:
        await db.close()
