from datetime import datetime, timedelta

import aiosqlite
from jose import jwt
from passlib.context import CryptContext

from backend.config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)

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
        hashed = pwd_context.hash(password)
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
