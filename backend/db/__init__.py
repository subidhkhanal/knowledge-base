"""Database abstraction layer for PostgreSQL (asyncpg)."""

from backend.db.connection import (
    Database,
    Result,
    get_central_db,
    init_central_pool,
    close_pools,
)
