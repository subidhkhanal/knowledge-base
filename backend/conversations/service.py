import json
from typing import List, Dict, Optional
from backend.auth.database import get_db


class ConversationService:
    @staticmethod
    async def create_conversation(user_id: int, title: str = "New Conversation") -> int:
        db = await get_db()
        try:
            cursor = await db.execute(
                "INSERT INTO conversations (user_id, title) VALUES (?, ?)",
                (user_id, title)
            )
            await db.commit()
            return cursor.lastrowid
        finally:
            await db.close()

    @staticmethod
    async def get_conversations(user_id: int) -> List[Dict]:
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT id, title, created_at, updated_at FROM conversations "
                "WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,)
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            await db.close()

    @staticmethod
    async def add_message(
        conversation_id: int,
        role: str,
        content: str,
        sources: Optional[List[Dict]] = None
    ):
        db = await get_db()
        try:
            await db.execute(
                "INSERT INTO messages (conversation_id, role, content, sources_json) VALUES (?, ?, ?, ?)",
                (conversation_id, role, content, json.dumps(sources) if sources else None)
            )
            await db.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (conversation_id,)
            )
            await db.commit()
        finally:
            await db.close()

    @staticmethod
    async def get_messages(conversation_id: int, limit: int = 50) -> List[Dict]:
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT role, content, sources_json, created_at FROM messages "
                "WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?",
                (conversation_id, limit)
            )
            rows = await cursor.fetchall()
            messages = []
            for row in rows:
                msg = dict(row)
                msg["sources"] = json.loads(msg.pop("sources_json")) if msg.get("sources_json") else []
                messages.append(msg)
            return messages
        finally:
            await db.close()

    @staticmethod
    async def get_recent_history(conversation_id: int, limit: int = 10) -> List[Dict[str, str]]:
        """Get recent messages formatted for chat_history parameter."""
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT role, content FROM messages "
                "WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
                (conversation_id, limit)
            )
            rows = await cursor.fetchall()
            return [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]
        finally:
            await db.close()

    @staticmethod
    async def delete_conversation(conversation_id: int, user_id: int) -> bool:
        db = await get_db()
        try:
            cursor = await db.execute(
                "DELETE FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id)
            )
            await db.commit()
            return cursor.rowcount > 0
        finally:
            await db.close()

    @staticmethod
    async def verify_ownership(conversation_id: int, user_id: int) -> bool:
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id)
            )
            return await cursor.fetchone() is not None
        finally:
            await db.close()
