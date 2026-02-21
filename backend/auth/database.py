"""Auth database — thin re-export layer.

All auth operations use the central DB.
Other modules import get_db from here for backward compatibility.
"""

from backend.db.connection import get_central_db, init_central_pool
from backend.db.schema import SCHEMA


# Re-export for modules that still import `from backend.auth.database import get_db`
get_db = get_central_db


async def init_db():
    """Initialize the DB pool and create all tables."""
    await init_central_pool()
    db = await get_central_db()
    try:
        await db.execute_script(SCHEMA)
    finally:
        await db.close()
