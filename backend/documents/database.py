"""SQLite CRUD operations for the documents table."""

from typing import Optional, List, Dict, Any
from backend.auth.database import get_db


async def create_documents_table():
    """Create the documents table if it doesn't exist. Called from init_db()."""
    db = await get_db()
    try:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                extension TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                user_id INTEGER,
                project_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
            CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
        """)
        await db.commit()
    finally:
        await db.close()


async def insert_document(
    filename: str,
    storage_path: str,
    extension: str,
    size_bytes: int,
    mime_type: str,
    user_id: Optional[int] = None,
    project_id: Optional[int] = None,
) -> int:
    """Insert a document record. Returns the document ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO documents
               (filename, storage_path, extension, size_bytes, mime_type, user_id, project_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (filename, storage_path, extension, size_bytes, mime_type, user_id, project_id),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_document_by_id(doc_id: int, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Get a document by ID, optionally filtered by user."""
    db = await get_db()
    try:
        if user_id is not None:
            cursor = await db.execute(
                "SELECT * FROM documents WHERE id = ? AND user_id = ?",
                (doc_id, user_id),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM documents WHERE id = ?", (doc_id,)
            )
        row = await cursor.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "filename": row["filename"],
            "storage_path": row["storage_path"],
            "extension": row["extension"],
            "size_bytes": row["size_bytes"],
            "mime_type": row["mime_type"],
            "user_id": row["user_id"],
            "project_id": row["project_id"],
            "created_at": row["created_at"],
        }
    finally:
        await db.close()


async def get_documents_by_project(project_id: int) -> List[Dict[str, Any]]:
    """Get all documents for a project."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, filename, extension, size_bytes, created_at FROM documents WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        return [
            {"id": row["id"], "filename": row["filename"], "extension": row["extension"],
             "size_bytes": row["size_bytes"], "created_at": row["created_at"]}
            for row in rows
        ]
    finally:
        await db.close()


async def delete_document(doc_id: int, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Delete a document by ID. Returns the document dict (for cleanup) or None if not found."""
    doc = await get_document_by_id(doc_id, user_id)
    if not doc:
        return None

    db = await get_db()
    try:
        await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        await db.commit()
        return doc
    finally:
        await db.close()
