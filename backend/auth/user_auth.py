"""Simple user ID header authentication for FastAPI with optional authentication."""

from typing import Optional
from fastapi import Header

ANONYMOUS_USER_ID = "anonymous"


async def get_current_user_optional(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id")
) -> dict:
    """
    FastAPI dependency to get current user from X-User-Id header (optional authentication).

    If no header is provided, returns an anonymous user.

    Args:
        x_user_id: User ID from X-User-Id header (set by NextAuth.js frontend)

    Returns:
        Dict with user information (user_id, is_anonymous)
    """
    if x_user_id is None or x_user_id.strip() == "":
        return {
            "user_id": ANONYMOUS_USER_ID,
            "is_anonymous": True,
        }

    return {
        "user_id": x_user_id,
        "is_anonymous": False,
    }


# Alias for backward compatibility
get_current_user = get_current_user_optional
