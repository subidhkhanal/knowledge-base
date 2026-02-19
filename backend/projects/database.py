"""SQLite CRUD operations for the projects table."""

import json
from typing import Optional, List, Dict, Any
from backend.auth.database import get_db


async def create_projects_table():
    """Create the projects table if it doesn't exist. Called from init_db()."""
    db = await get_db()
    try:
        # Check if table exists with NOT NULL constraint on user_id (old schema)
        rows = await db.execute_fetchall(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'"
        )
        if rows and "NOT NULL" in (rows[0][0] or ""):
            # Old schema with NOT NULL — check if empty so we can recreate
            count = await db.execute_fetchall("SELECT COUNT(*) FROM projects")
            if count[0][0] == 0:
                await db.execute("DROP TABLE projects")
                await db.commit()

        await db.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                user_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
            CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
        """)
        await db.commit()
    finally:
        await db.close()


async def insert_project(
    slug: str,
    title: str,
    description: str,
    user_id: Optional[int] = None,
) -> int:
    """Insert a new project. Returns the project ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO projects (slug, title, description, user_id)
               VALUES (?, ?, ?, ?)""",
            (slug, title, description, user_id),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_all_projects(user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Get all projects, optionally filtered by user. Returns all when user_id is None."""
    db = await get_db()
    try:
        if user_id:
            rows = await db.execute_fetchall(
                """SELECT p.id, p.slug, p.title, p.description, p.created_at, p.updated_at,
                          (SELECT COUNT(*) FROM articles a WHERE a.project_id = p.id) as article_count
                   FROM projects p
                   WHERE p.user_id = ?
                   ORDER BY p.updated_at DESC""",
                (user_id,),
            )
        else:
            rows = await db.execute_fetchall(
                """SELECT p.id, p.slug, p.title, p.description, p.created_at, p.updated_at,
                          (SELECT COUNT(*) FROM articles a WHERE a.project_id = p.id) as article_count
                   FROM projects p
                   ORDER BY p.updated_at DESC"""
            )
        return [
            {
                "id": r[0],
                "slug": r[1],
                "title": r[2],
                "description": r[3],
                "created_at": r[4],
                "updated_at": r[5],
                "article_count": r[6],
            }
            for r in rows
        ]
    finally:
        await db.close()


async def get_project_by_slug(slug: str, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Get a single project by slug. When user_id is None, matches by slug only."""
    db = await get_db()
    try:
        if user_id:
            rows = await db.execute_fetchall(
                """SELECT id, slug, title, description, created_at, updated_at
                   FROM projects WHERE slug = ? AND user_id = ?""",
                (slug, user_id),
            )
        else:
            rows = await db.execute_fetchall(
                """SELECT id, slug, title, description, created_at, updated_at
                   FROM projects WHERE slug = ?""",
                (slug,),
            )
        if not rows:
            return None
        r = rows[0]
        return {
            "id": r[0],
            "slug": r[1],
            "title": r[2],
            "description": r[3],
            "created_at": r[4],
            "updated_at": r[5],
        }
    finally:
        await db.close()


async def get_project_id_by_slug(slug: str, user_id: Optional[int] = None) -> Optional[int]:
    """Get just the project ID for a given slug. Used for quick lookups."""
    db = await get_db()
    try:
        if user_id:
            rows = await db.execute_fetchall(
                "SELECT id FROM projects WHERE slug = ? AND user_id = ?",
                (slug, user_id),
            )
        else:
            rows = await db.execute_fetchall(
                "SELECT id FROM projects WHERE slug = ?",
                (slug,),
            )
        return rows[0][0] if rows else None
    finally:
        await db.close()


async def update_project(
    slug: str, title: str, description: str, user_id: Optional[int] = None
) -> bool:
    """Update a project's title and description. Returns True if updated."""
    db = await get_db()
    try:
        if user_id:
            cursor = await db.execute(
                """UPDATE projects
                   SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE slug = ? AND user_id = ?""",
                (title, description, slug, user_id),
            )
        else:
            cursor = await db.execute(
                """UPDATE projects
                   SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE slug = ?""",
                (title, description, slug),
            )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def delete_project(slug: str, user_id: Optional[int] = None) -> Optional[int]:
    """Delete a project by slug. Returns the project ID if deleted, None otherwise."""
    db = await get_db()
    try:
        if user_id:
            rows = await db.execute_fetchall(
                "SELECT id FROM projects WHERE slug = ? AND user_id = ?",
                (slug, user_id),
            )
        else:
            rows = await db.execute_fetchall(
                "SELECT id FROM projects WHERE slug = ?",
                (slug,),
            )
        if not rows:
            return None
        project_id = rows[0][0]

        # Delete the project (articles will be unlinked, not deleted)
        await db.execute(
            "DELETE FROM projects WHERE id = ?", (project_id,)
        )
        # Unlink articles from this project
        await db.execute(
            "UPDATE articles SET project_id = NULL WHERE project_id = ?",
            (project_id,),
        )
        await db.commit()
        return project_id
    finally:
        await db.close()


async def slug_exists(slug: str) -> bool:
    """Check if a project slug already exists."""
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            "SELECT 1 FROM projects WHERE slug = ?", (slug,)
        )
        return len(rows) > 0
    finally:
        await db.close()
