"""Supabase Storage helper for uploaded document files."""

from supabase import create_client
from backend.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_STORAGE_BUCKET


def _get_bucket():
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return client.storage.from_(SUPABASE_STORAGE_BUCKET)


def upload_file(storage_key: str, content: bytes, content_type: str) -> None:
    """Upload file bytes to Supabase Storage."""
    _get_bucket().upload(
        path=storage_key,
        file=content,
        file_options={"content-type": content_type, "upsert": "true"},
    )


def download_file(storage_key: str) -> bytes:
    """Download file bytes from Supabase Storage."""
    return _get_bucket().download(storage_key)


def delete_file(storage_key: str) -> None:
    """Delete a file from Supabase Storage."""
    _get_bucket().remove([storage_key])
