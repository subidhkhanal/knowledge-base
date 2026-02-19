from backend.documents.routes import router as documents_router
from backend.documents.database import create_documents_table

__all__ = ["documents_router", "create_documents_table"]
