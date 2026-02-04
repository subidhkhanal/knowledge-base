import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

from backend.ingestion import (
    PDFProcessor, Chunker, TextProcessor,
    EPUBProcessor, is_ebooklib_available,
    DOCXProcessor, is_docx_available,
    HTMLProcessor, is_html_available
)
from backend.storage import VectorStore, ChatStore
from backend.retrieval import QueryEngine
from backend.auth import get_current_user

app = FastAPI(
    title="Personal Knowledge Base API",
    description="RAG system for querying personal content",
    version="1.0.0"
)

# CORS for frontend
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://personal-assistant-olive.vercel.app",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-load heavy components to speed up startup
pdf_processor = None
text_processor = None
epub_processor = None
docx_processor = None
html_processor = None
chunker = None
vector_store = None
query_engine = None
chat_store = None


def get_components():
    global pdf_processor, text_processor, epub_processor, docx_processor, html_processor
    global chunker, vector_store, query_engine, chat_store
    if pdf_processor is None:
        pdf_processor = PDFProcessor()
        text_processor = TextProcessor()
        chunker = Chunker()
        vector_store = VectorStore()
        query_engine = QueryEngine()
        chat_store = ChatStore()
        # Initialize optional processors if available
        if is_ebooklib_available():
            epub_processor = EPUBProcessor()
        if is_docx_available():
            docx_processor = DOCXProcessor()
        if is_html_available():
            html_processor = HTMLProcessor()
    return {
        "pdf": pdf_processor,
        "text": text_processor,
        "epub": epub_processor,
        "docx": docx_processor,
        "html": html_processor,
        "chunker": chunker,
        "vector_store": vector_store,
        "query_engine": query_engine,
        "chat_store": chat_store
    }


# Request/Response models
class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    threshold: float = 0.3
    source_filter: Optional[str] = None
    session_id: Optional[str] = None


class TextUploadRequest(BaseModel):
    content: str
    title: str = "Untitled Note"


class QueryResponse(BaseModel):
    question: str
    answer: str
    sources: List[dict]
    chunks_used: int
    provider: Optional[str]


class SourceResponse(BaseModel):
    source: str
    source_type: str
    chunk_count: int


class UploadResponse(BaseModel):
    message: str
    source: str
    chunks_created: int


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    sources: Optional[List[dict]] = None
    chunks_used: Optional[int] = None
    provider: Optional[str] = None
    created_at: str


class SessionWithMessagesResponse(SessionResponse):
    messages: List[MessageResponse]


# Health check endpoint (responds immediately, no heavy loading, no auth)
@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Root endpoint (no auth)
@app.get("/")
async def root():
    return {
        "message": "Personal Knowledge Base API",
        "version": "1.0.0",
        "supported_formats": list(SUPPORTED_EXTENSIONS.keys()),
        "endpoints": {
            "health": "GET /health",
            "upload_document": "POST /api/upload/document (PDF, EPUB, DOCX, HTML, TXT, MD)",
            "upload_text": "POST /api/upload/text",
            "query": "POST /api/query",
            "sources": "GET /api/sources",
            "delete_source": "DELETE /api/sources/{source_name}",
            "stats": "GET /api/stats",
            "chat_sessions": "GET/POST /api/chat/sessions",
            "chat_session": "GET/DELETE /api/chat/sessions/{id}",
            "update_session_title": "PATCH /api/chat/sessions/{id}"
        }
    }


# Supported file extensions and their processors
SUPPORTED_EXTENSIONS = {
    ".pdf": "pdf",
    ".epub": "epub",
    ".docx": "docx",
    ".doc": "docx",  # Will work for .docx only, not legacy .doc
    ".html": "html",
    ".htm": "html",
    ".txt": "text",
    ".md": "text",
    ".markdown": "text",
}


@app.post("/api/upload/document", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and process any supported document type for the authenticated user."""
    filename = file.filename.lower()
    ext = "." + filename.split(".")[-1] if "." in filename else ""

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: {', '.join(SUPPORTED_EXTENSIONS.keys())}"
        )

    processor_type = SUPPORTED_EXTENSIONS[ext]
    user_id = current_user["user_id"]
    components = get_components()
    content = await file.read()

    processor = components.get(processor_type)
    if processor is None:
        raise HTTPException(
            status_code=503,
            detail=f"Processor for {ext} files is not available. Check dependencies."
        )

    # Extract text using appropriate processor
    documents = processor.process_bytes(content, file.filename)

    if not documents:
        raise HTTPException(status_code=400, detail=f"No text could be extracted from the file")

    # Chunk the documents
    chunks = components["chunker"].chunk_documents(documents)

    # Store in vector database with user_id
    components["vector_store"].add_documents(chunks, user_id=user_id)

    return UploadResponse(
        message=f"{ext.upper()[1:]} processed successfully",
        source=file.filename,
        chunks_created=len(chunks)
    )


@app.post("/api/upload/text", response_model=UploadResponse)
async def upload_text(
    request: TextUploadRequest,
    current_user: dict = Depends(get_current_user)
):
    """Upload direct text content for the authenticated user."""
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    user_id = current_user["user_id"]
    components = get_components()

    # Process text
    documents = components["text"].process_text(request.content, request.title)

    # Chunk the documents
    chunks = components["chunker"].chunk_documents(documents)

    # Store in vector database with user_id
    components["vector_store"].add_documents(chunks, user_id=user_id)

    return UploadResponse(
        message="Text processed successfully",
        source=request.title,
        chunks_created=len(chunks)
    )


@app.post("/api/query", response_model=QueryResponse)
async def query(
    request: QueryRequest,
    current_user: dict = Depends(get_current_user)
):
    """Query the knowledge base for the authenticated user."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    user_id = current_user["user_id"]
    components = get_components()

    result = await components["query_engine"].query(
        question=request.question,
        user_id=user_id,
        top_k=request.top_k,
        threshold=request.threshold,
        source_filter=request.source_filter
    )

    # Auto-save to chat session if session_id is provided
    if request.session_id:
        chat_store = components["chat_store"]
        # Save user message
        chat_store.add_message(
            session_id=request.session_id,
            user_id=user_id,
            role="user",
            content=request.question
        )
        # Save assistant response
        chat_store.add_message(
            session_id=request.session_id,
            user_id=user_id,
            role="assistant",
            content=result["answer"],
            sources=result.get("sources"),
            chunks_used=result.get("chunks_used"),
            provider=result.get("provider")
        )

    return QueryResponse(**result)


@app.get("/api/sources", response_model=List[SourceResponse])
async def get_sources(current_user: dict = Depends(get_current_user)):
    """Get all ingested sources for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    sources = components["vector_store"].get_all_sources(user_id=user_id)
    return [SourceResponse(**s) for s in sources]


@app.get("/api/sources/{source_name}/content")
async def get_source_content(
    source_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all chunks/content for a specific source document."""
    user_id = current_user["user_id"]
    components = get_components()
    chunks = components["vector_store"].get_chunks_by_source(source_name, user_id=user_id)

    if not chunks:
        raise HTTPException(status_code=404, detail=f"Source '{source_name}' not found")

    return {
        "source": source_name,
        "total_chunks": len(chunks),
        "chunks": chunks
    }


@app.delete("/api/sources/{source_name}")
async def delete_source(
    source_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete all documents from a specific source for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    deleted = components["vector_store"].delete_by_source(source_name, user_id=user_id)

    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"Source '{source_name}' not found")

    return {
        "message": f"Deleted {deleted} chunks from '{source_name}'",
        "source": source_name,
        "chunks_deleted": deleted
    }


@app.get("/api/chunks/{chunk_id}")
async def get_chunk_context(
    chunk_id: str,
    context_size: int = 1,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific chunk with surrounding context for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    result = components["vector_store"].get_chunk_with_context(
        chunk_id=chunk_id,
        user_id=user_id,
        context_size=context_size
    )

    if not result:
        raise HTTPException(status_code=404, detail="Chunk not found")

    return result


@app.get("/api/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """Get knowledge base statistics for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    sources = components["vector_store"].get_all_sources(user_id=user_id)
    total_chunks = components["vector_store"].count(user_id=user_id)

    return {
        "total_sources": len(sources),
        "total_chunks": total_chunks,
        "supported_formats": list(SUPPORTED_EXTENSIONS.keys()),
        "epub_available": is_ebooklib_available(),
        "docx_available": is_docx_available(),
        "html_available": is_html_available()
    }


# Chat Session Endpoints
@app.get("/api/chat/sessions", response_model=List[SessionResponse])
async def get_chat_sessions(current_user: dict = Depends(get_current_user)):
    """Get all chat sessions for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    sessions = components["chat_store"].get_sessions(user_id)
    return [SessionResponse(**s) for s in sessions]


@app.post("/api/chat/sessions", response_model=SessionResponse)
async def create_chat_session(
    request: CreateSessionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a new chat session for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    session = components["chat_store"].create_session(user_id, request.title)
    return SessionResponse(**session)


@app.get("/api/chat/sessions/{session_id}", response_model=SessionWithMessagesResponse)
async def get_chat_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a chat session with all messages for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    session = components["chat_store"].get_session(session_id, user_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionWithMessagesResponse(**session)


@app.delete("/api/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a chat session for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    deleted = components["chat_store"].delete_session(session_id, user_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session deleted", "session_id": session_id}


@app.patch("/api/chat/sessions/{session_id}")
async def update_chat_session_title(
    session_id: str,
    request: CreateSessionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update chat session title for the authenticated user."""
    if not request.title:
        raise HTTPException(status_code=400, detail="Title is required")

    user_id = current_user["user_id"]
    components = get_components()
    updated = components["chat_store"].update_session_title(session_id, user_id, request.title)

    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session updated", "session_id": session_id, "title": request.title}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
