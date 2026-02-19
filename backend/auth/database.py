import aiosqlite
from backend.config import SQLITE_DB_PATH


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(SQLITE_DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    db = await aiosqlite.connect(SQLITE_DB_PATH)
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT DEFAULT 'New Conversation',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            sources_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
    """)
    await db.commit()
    await db.close()

    # Create projects table (must be before articles due to FK)
    from backend.projects.database import create_projects_table
    await create_projects_table()

    # Create articles table (separate module manages it)
    from backend.articles.database import create_articles_table
    await create_articles_table()
