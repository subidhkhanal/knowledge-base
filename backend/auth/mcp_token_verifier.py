"""
MCP Token Verifier — validates Bearer tokens for MCP HTTP transport.

Uses FastMCP's built-in TokenVerifier protocol. Looks up the token in
the users.mcp_token column and returns an AccessToken with client_id
set to the user's ID string.
"""

import aiosqlite
from mcp.server.auth.provider import AccessToken

from backend.config import SQLITE_DB_PATH


class MCPTokenVerifier:
    async def verify_token(self, token: str) -> AccessToken | None:
        if not token:
            return None

        db = await aiosqlite.connect(SQLITE_DB_PATH)
        db.row_factory = aiosqlite.Row
        try:
            cursor = await db.execute(
                "SELECT id, username FROM users WHERE mcp_token = ?",
                (token,),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            return AccessToken(
                token=token,
                client_id=str(row["id"]),
                scopes=[],
                expires_at=None,
            )
        finally:
            await db.close()
