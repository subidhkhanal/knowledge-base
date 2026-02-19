"""Projects module — project container management."""

from backend.projects.routes import router as projects_router
from backend.projects.database import create_projects_table

__all__ = ["projects_router", "create_projects_table"]
