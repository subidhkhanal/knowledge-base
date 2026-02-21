"""PostgreSQL CRUD operations for the documents table."""

from typing import Optional, List, Dict, Any
from backend.db.connection import get_central_db


async def insert_document(
    filename: str,
    storage_path: str,
    extension: str,
    size_bytes: int,
    mime_type: str,
    user_id: int,
    project_id: Optional[int] = None,
) -> int:
    """Insert a document record. Returns the document ID."""
    db = await get_central_db()
    try:
        result = await db.execute(
            """INSERT INTO documents
               (user_id, filename, storage_path, extension, size_bytes, mime_type, project_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            user_id, filename, storage_path, extension, size_bytes, mime_type, project_id,
        )
        return result.lastrowid
    finally:
        await db.close()


async def get_document_by_id(doc_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    """Get a document by ID."""
    db = await get_central_db()
    try:
        row = await db.fetch_one(
            "SELECT * FROM documents WHERE id = $1 AND user_id = $2", doc_id, user_id
        )
        if not row:
            return None
        return {
            "id": row["id"],
            "filename": row["filename"],
            "storage_path": row["storage_path"],
            "extension": row["extension"],
            "size_bytes": row["size_bytes"],
            "mime_type": row["mime_type"],
            "project_id": row["project_id"],
            "created_at": str(row["created_at"]),
        }
    finally:
        await db.close()


async def get_documents_by_project(project_id: int, user_id: int) -> List[Dict[str, Any]]:
    """Get all documents for a project."""
    db = await get_central_db()
    try:
        rows = await db.fetch_all(
            "SELECT id, filename, extension, size_bytes, created_at FROM documents WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC",
            project_id, user_id,
        )
        return [
            {"id": r["id"], "filename": r["filename"], "extension": r["extension"],
             "size_bytes": r["size_bytes"], "created_at": str(r["created_at"])}
            for r in rows
        ]
    finally:
        await db.close()


async def delete_document(doc_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    """Delete a document by ID. Returns the document dict (for cleanup) or None if not found."""
    doc = await get_document_by_id(doc_id, user_id)
    if not doc:
        return None

    db = await get_central_db()
    try:
        await db.execute("DELETE FROM documents WHERE id = $1 AND user_id = $2", doc_id, user_id)
        return doc
    finally:
        await db.close()
