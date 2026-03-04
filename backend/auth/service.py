import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt

from backend.config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS
from backend.db.connection import Database


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
    def _hash_refresh_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode()).hexdigest()

    @staticmethod
    async def create_refresh_token(db: Database, user_id: int) -> str:
        """Generate a refresh token, store its hash in DB, return the raw token."""
        raw_token = secrets.token_hex(32)
        token_hash = AuthService._hash_refresh_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await db.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            user_id, token_hash, expires_at,
        )
        return raw_token

    @staticmethod
    async def validate_refresh_token(db: Database, raw_token: str) -> int | None:
        """Validate a refresh token. Returns user_id if valid, None otherwise."""
        if not raw_token:
            return None
        token_hash = AuthService._hash_refresh_token(raw_token)
        row = await db.fetch_one(
            "SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1",
            token_hash,
        )
        if not row:
            return None
        expires_at = row["expires_at"]
        # Make expires_at timezone-aware if it isn't
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            # Expired — clean it up
            await db.execute("DELETE FROM refresh_tokens WHERE token_hash = $1", token_hash)
            return None
        return row["user_id"]

    @staticmethod
    async def revoke_refresh_token(db: Database, raw_token: str) -> None:
        """Invalidate a refresh token (used on logout)."""
        if not raw_token:
            return
        token_hash = AuthService._hash_refresh_token(raw_token)
        await db.execute("DELETE FROM refresh_tokens WHERE token_hash = $1", token_hash)

    @staticmethod
    async def create_user(db: Database, username: str, password: str) -> int:
        hashed = AuthService.hash_password(password)
        result = await db.execute(
            "INSERT INTO users (username, hashed_password) VALUES ($1, $2)",
            username, hashed,
        )
        return result.lastrowid

    @staticmethod
    async def get_user_by_username(db: Database, username: str):
        return await db.fetch_one(
            "SELECT * FROM users WHERE username = $1", username
        )
