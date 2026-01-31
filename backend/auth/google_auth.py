"""Google OAuth token verification for FastAPI with optional authentication."""

import os
from typing import Optional
from fastapi import Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.oauth2 import id_token
from google.auth.transport import requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
ANONYMOUS_USER_ID = "anonymous"

# Use auto_error=False to make authentication optional
security = HTTPBearer(auto_error=False)


async def verify_google_token(token: str) -> dict:
    """
    Verify Google ID token and return user info.

    Args:
        token: Google ID token from NextAuth.js

    Returns:
        Dict with user_id, email, name, and picture

    Raises:
        ValueError: If token is invalid or expired
    """
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID not configured on server")

    idinfo = id_token.verify_oauth2_token(
        token,
        requests.Request(),
        GOOGLE_CLIENT_ID
    )

    # Verify the token is from Google
    if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
        raise ValueError("Invalid issuer")

    return {
        "user_id": idinfo["sub"],  # Google's unique user ID
        "email": idinfo.get("email"),
        "name": idinfo.get("name"),
        "picture": idinfo.get("picture"),
    }


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """
    FastAPI dependency to get current user (optional authentication).

    If no token is provided, returns an anonymous user.
    If token is provided but invalid, still returns anonymous user.

    Returns:
        Dict with user information (user_id, email, name, picture)
    """
    if credentials is None:
        return {
            "user_id": ANONYMOUS_USER_ID,
            "email": None,
            "name": "Guest",
            "picture": None,
            "is_anonymous": True,
        }

    try:
        user = await verify_google_token(credentials.credentials)
        user["is_anonymous"] = False
        return user
    except Exception:
        # If token verification fails, fall back to anonymous
        return {
            "user_id": ANONYMOUS_USER_ID,
            "email": None,
            "name": "Guest",
            "picture": None,
            "is_anonymous": True,
        }


# Alias for backward compatibility
get_current_user = get_current_user_optional
