"""Articles module — conversation-to-article publishing pipeline."""

from backend.articles.routes import router as articles_router

__all__ = ["articles_router"]
