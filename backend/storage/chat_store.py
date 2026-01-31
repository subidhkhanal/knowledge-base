import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from contextlib import contextmanager

from backend.config import CHAT_DB_PATH


class ChatStore:
    def __init__(self):
        self.db_path = CHAT_DB_PATH
        self._init_db()

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sources TEXT,
                    chunks_used INTEGER,
                    provider TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id);
                CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
            """)

    def create_session(self, user_id: str, title: Optional[str] = None) -> Dict[str, Any]:
        session_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (session_id, user_id, title or "New Chat", now, now)
            )

        return {
            "id": session_id,
            "user_id": user_id,
            "title": title or "New Chat",
            "created_at": now,
            "updated_at": now
        }

    def get_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, user_id, title, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,)
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_session(self, session_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, user_id, title, created_at, updated_at FROM chat_sessions WHERE id = ? AND user_id = ?",
                (session_id, user_id)
            )
            row = cursor.fetchone()
            if not row:
                return None

            session = dict(row)

            msg_cursor = conn.execute(
                "SELECT id, role, content, sources, chunks_used, provider, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,)
            )
            messages = []
            for msg_row in msg_cursor.fetchall():
                msg = dict(msg_row)
                if msg["sources"]:
                    msg["sources"] = json.loads(msg["sources"])
                messages.append(msg)

            session["messages"] = messages
            return session

    def delete_session(self, session_id: str, user_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?",
                (session_id, user_id)
            )
            return cursor.rowcount > 0

    def update_session_title(self, session_id: str, user_id: str, title: str) -> bool:
        now = datetime.utcnow().isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute(
                "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (title, now, session_id, user_id)
            )
            return cursor.rowcount > 0

    def add_message(
        self,
        session_id: str,
        user_id: str,
        role: str,
        content: str,
        sources: Optional[List[Dict]] = None,
        chunks_used: Optional[int] = None,
        provider: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            check = conn.execute(
                "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?",
                (session_id, user_id)
            ).fetchone()

            if not check:
                return None

            message_id = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            sources_json = json.dumps(sources) if sources else None

            conn.execute(
                "INSERT INTO chat_messages (id, session_id, role, content, sources, chunks_used, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (message_id, session_id, role, content, sources_json, chunks_used, provider, now)
            )

            conn.execute(
                "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
                (now, session_id)
            )

            return {
                "id": message_id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "sources": sources,
                "chunks_used": chunks_used,
                "provider": provider,
                "created_at": now
            }

    def get_messages(self, session_id: str, user_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            check = conn.execute(
                "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?",
                (session_id, user_id)
            ).fetchone()

            if not check:
                return []

            cursor = conn.execute(
                "SELECT id, role, content, sources, chunks_used, provider, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,)
            )

            messages = []
            for row in cursor.fetchall():
                msg = dict(row)
                if msg["sources"]:
                    msg["sources"] = json.loads(msg["sources"])
                messages.append(msg)

            return messages
