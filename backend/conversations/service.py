import json
from typing import List, Dict, Optional
from backend.db.connection import get_central_db


class ConversationService:
    @staticmethod
    async def create_conversation(user_id: int, title: str = "New Conversation") -> int:
        db = await get_central_db()
        try:
            result = await db.execute(
                "INSERT INTO conversations (user_id, title) VALUES ($1, $2)",
                user_id, title,
            )
            return result.lastrowid
        finally:
            await db.close()

    @staticmethod
    async def get_conversations(user_id: int) -> List[Dict]:
        db = await get_central_db()
        try:
            rows = await db.fetch_all(
                "SELECT id, title, created_at, updated_at FROM conversations "
                "WHERE user_id = $1 ORDER BY updated_at DESC",
                user_id,
            )
            return [
                {k: str(v) if k in ("created_at", "updated_at") else v for k, v in row.items()}
                for row in rows
            ]
        finally:
            await db.close()

    @staticmethod
    async def add_message(
        conversation_id: int,
        role: str,
        content: str,
        sources: Optional[List[Dict]] = None,
        user_id: Optional[int] = None,
    ):
        db = await get_central_db()
        try:
            await db.execute(
                "INSERT INTO messages (conversation_id, role, content, sources_json) VALUES ($1, $2, $3, $4)",
                conversation_id, role, content, json.dumps(sources) if sources else None,
            )
            await db.execute(
                "UPDATE conversations SET updated_at = NOW() WHERE id = $1 AND user_id = $2",
                conversation_id, user_id,
            )
        finally:
            await db.close()

    @staticmethod
    async def get_messages(conversation_id: int, limit: int = 50, user_id: Optional[int] = None) -> List[Dict]:
        db = await get_central_db()
        try:
            rows = await db.fetch_all(
                "SELECT role, content, sources_json, created_at FROM messages "
                "WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2",
                conversation_id, limit,
            )
            messages = []
            for row in rows:
                msg = dict(row)
                msg["sources"] = json.loads(msg.pop("sources_json")) if msg.get("sources_json") else []
                msg["created_at"] = str(msg["created_at"])
                messages.append(msg)
            return messages
        finally:
            await db.close()

    @staticmethod
    async def get_recent_history(conversation_id: int, limit: int = 10, user_id: Optional[int] = None) -> List[Dict[str, str]]:
        """Get recent messages formatted for chat_history parameter."""
        db = await get_central_db()
        try:
            rows = await db.fetch_all(
                "SELECT role, content FROM messages "
                "WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2",
                conversation_id, limit,
            )
            return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
        finally:
            await db.close()

    @staticmethod
    async def delete_conversation(conversation_id: int, user_id: int) -> bool:
        db = await get_central_db()
        try:
            result = await db.execute(
                "DELETE FROM conversations WHERE id = $1 AND user_id = $2",
                conversation_id, user_id,
            )
            return result.rowcount > 0
        finally:
            await db.close()

    @staticmethod
    async def verify_ownership(conversation_id: int, user_id: int) -> bool:
        db = await get_central_db()
        try:
            row = await db.fetch_one(
                "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
                conversation_id, user_id,
            )
            return row is not None
        finally:
            await db.close()
