import base64
import hashlib
import secrets
from datetime import datetime, timedelta

import aiosqlite
from jose import jwt

from backend.config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_MINUTES


class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_bytes(32)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations=600_000)
        return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        salt_b64, dk_b64 = hashed.split("$", 1)
        salt = base64.b64decode(salt_b64)
        dk = base64.b64decode(dk_b64)
        check = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, iterations=600_000)
        return secrets.compare_digest(dk, check)

    @staticmethod
    def create_token(user_id: int, username: str) -> str:
        expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
        payload = {"sub": str(user_id), "username": username, "exp": expire}
        return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    @staticmethod
    def decode_token(token: str) -> dict:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])

    @staticmethod
    async def create_user(db: aiosqlite.Connection, username: str, password: str) -> int:
        hashed = AuthService.hash_password(password)
        cursor = await db.execute(
            "INSERT INTO users (username, hashed_password) VALUES (?, ?)",
            (username, hashed)
        )
        await db.commit()
        return cursor.lastrowid

    @staticmethod
    async def get_user_by_username(db: aiosqlite.Connection, username: str):
        cursor = await db.execute("SELECT * FROM users WHERE username = ?", (username,))
        return await cursor.fetchone()
