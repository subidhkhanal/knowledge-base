"""FastAPI router for document file serving."""

import os
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from typing import Optional

from backend.auth import get_optional_user
from backend.documents import database as db

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("/{doc_id}")
async def get_document_metadata(
    doc_id: int,
    current_user: dict = Depends(get_optional_user),
):
    """Get document metadata."""
    user_id = current_user["user_id"] if current_user else None
    document = await db.get_document_by_id(doc_id, user_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": document["id"],
        "filename": document["filename"],
        "extension": document["extension"],
        "size_bytes": document["size_bytes"],
        "mime_type": document["mime_type"],
        "project_id": document["project_id"],
        "created_at": document["created_at"],
    }


@router.get("/{doc_id}/file")
async def serve_document_file(
    doc_id: int,
    current_user: dict = Depends(get_optional_user),
):
    """Serve the original uploaded file by document ID."""
    user_id = current_user["user_id"] if current_user else None
    document = await db.get_document_by_id(doc_id, user_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = document["storage_path"]
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=file_path,
        filename=document["filename"],
        media_type=document["mime_type"],
    )
