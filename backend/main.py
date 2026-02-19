import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import json
import uvicorn

from backend.ingestion import (
    PDFProcessor, Chunker, RecursiveChunker, TextProcessor,
    EPUBProcessor, is_ebooklib_available,
    DOCXProcessor, is_docx_available,
    HTMLProcessor, is_html_available
)
from backend.storage import VectorStore
from backend.retrieval import QueryEngine
from backend.retrieval.bm25_index import BM25Index
from backend.config import (
    MAX_UPLOAD_SIZE, MAX_UPLOAD_SIZE_MB, ENABLE_QUERY_ROUTING, SQLITE_DB_PATH,
    CHUNKING_METHOD, USE_HYBRID_RETRIEVAL, UPLOADS_DIR
)
from backend.routing import QueryRouter, RouteHandlers
from backend.auth import AuthService, UserCreate, UserLogin, Token, get_current_user, get_optional_user
from backend.auth.database import init_db, get_db
from backend.conversations import ConversationService
from backend.articles import articles_router
from backend.projects import projects_router
from backend.documents import documents_router

app = FastAPI(
    title="Personal Knowledge Base API",
    description="RAG system for querying personal content",
    version="1.0.0"
)

# CORS for frontend + Chrome extension
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount article publishing routes
app.include_router(articles_router)
app.include_router(projects_router)
app.include_router(documents_router)


@app.on_event("startup")
async def startup():
    os.makedirs(os.path.dirname(SQLITE_DB_PATH), exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    await init_db()


# --- Auth endpoints (no auth required) ---

@app.post("/api/auth/register")
async def register(user: UserCreate):
    db = await get_db()
    try:
        existing = await AuthService.get_user_by_username(db, user.username)
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        user_id = await AuthService.create_user(db, user.username, user.password)
        token = AuthService.create_token(user_id, user.username)
        return {"access_token": token, "token_type": "bearer", "user_id": user_id, "username": user.username}
    finally:
        await db.close()


@app.post("/api/auth/login")
async def login(user: UserLogin):
    db = await get_db()
    try:
        db_user = await AuthService.get_user_by_username(db, user.username)
        if not db_user or not AuthService.verify_password(user.password, db_user["hashed_password"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token = AuthService.create_token(db_user["id"], db_user["username"])
        return {"access_token": token, "token_type": "bearer", "user_id": db_user["id"], "username": db_user["username"]}
    finally:
        await db.close()


# Lazy-load heavy components to speed up startup
pdf_processor = None
text_processor = None
epub_processor = None
docx_processor = None
html_processor = None
chunker = None
vector_store = None
query_engine = None
query_router = None
route_handlers = None
bm25_index = None


def get_components():
    global pdf_processor, text_processor, epub_processor, docx_processor, html_processor
    global chunker, vector_store, query_engine, query_router, route_handlers, bm25_index

    # Initialize basic processors first (these don't require external APIs)
    if pdf_processor is None:
        pdf_processor = PDFProcessor()
        text_processor = TextProcessor()
        if CHUNKING_METHOD == "recursive":
            chunker = RecursiveChunker()
        else:
            chunker = Chunker()
        # Initialize optional processors if available
        if is_ebooklib_available():
            epub_processor = EPUBProcessor()
        if is_docx_available():
            docx_processor = DOCXProcessor()
        if is_html_available():
            html_processor = HTMLProcessor()

    # Initialize BM25 index for hybrid retrieval
    if bm25_index is None and USE_HYBRID_RETRIEVAL:
        bm25_index = BM25Index()
        bm25_index.load()  # Try loading from cache

    # Initialize vector store and query engine (require API keys)
    # Check separately so a failed init can be retried
    if vector_store is None:
        try:
            vector_store = VectorStore()
        except ValueError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Vector store initialization failed: {str(e)}"
            )

    if query_engine is None:
        query_engine = QueryEngine(vector_store=vector_store, bm25_index=bm25_index)

    # Initialize query router and handlers (if routing is enabled)
    if query_router is None and ENABLE_QUERY_ROUTING:
        query_router = QueryRouter()
        route_handlers = RouteHandlers(
            vector_store=vector_store,
            query_engine=query_engine
        )

    return {
        "pdf": pdf_processor,
        "text": text_processor,
        "epub": epub_processor,
        "docx": docx_processor,
        "html": html_processor,
        "chunker": chunker,
        "vector_store": vector_store,
        "query_engine": query_engine,
        "query_router": query_router,
        "route_handlers": route_handlers,
        "bm25_index": bm25_index,
    }


# Request/Response models
class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    threshold: float = 0.3
    source_filter: Optional[str] = None
    chat_history: Optional[List[dict]] = None
    conversation_id: Optional[int] = None


class TextUploadRequest(BaseModel):
    content: str
    title: str = "Untitled Note"


class QueryResponse(BaseModel):
    question: str
    answer: str
    sources: List[dict]
    chunks_used: int
    provider: Optional[str]
    route_type: Optional[str] = None


class SourceResponse(BaseModel):
    source: str
    source_type: str
    chunk_count: int


class UploadResponse(BaseModel):
    message: str
    source: str
    chunks_created: int
    document_id: Optional[int] = None


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
            "stats": "GET /api/stats"
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
    project_id: Optional[int] = Form(None),
    current_user: dict = Depends(get_optional_user),
):
    """Upload and process any supported document type."""
    filename = file.filename.lower()
    ext = "." + filename.split(".")[-1] if "." in filename else ""

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: {', '.join(SUPPORTED_EXTENSIONS.keys())}"
        )

    processor_type = SUPPORTED_EXTENSIONS[ext]
    components = get_components()
    content = await file.read()

    # Check file size
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_MB} MB."
        )

    processor = components.get(processor_type)
    if processor is None:
        raise HTTPException(
            status_code=503,
            detail=f"Processor for {ext} files is not available. Check dependencies."
        )

    # Extract text using appropriate processor
    try:
        documents = processor.process_bytes(content, file.filename)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read {ext} file: {str(e)}. The file may be corrupted or password-protected."
        )

    if not documents:
        raise HTTPException(
            status_code=400,
            detail=f"No text found in '{file.filename}'. The file may be empty, contain only images, or be in an unsupported format."
        )

    # Chunk the documents
    try:
        chunks = components["chunker"].chunk_documents(documents)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Text processing failed: {str(e)}. Try a different file or check for special characters."
        )

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail=f"Text from '{file.filename}' is too short (minimum ~100 words needed for meaningful search)."
        )

    # Tag chunks with project_id if provided
    if project_id is not None:
        for chunk in chunks:
            chunk["project_id"] = project_id

    # Store in vector database
    try:
        user_id_str = str(current_user["user_id"]) if current_user else None
        doc_ids = components["vector_store"].add_documents(chunks, user_id=user_id_str)
    except Exception as e:
        error_msg = str(e).lower()
        if "api" in error_msg or "key" in error_msg or "unauthorized" in error_msg:
            detail = "Vector database authentication failed. Check your PINECONE_API_KEY and COHERE_API_KEY."
        elif "timeout" in error_msg or "connection" in error_msg:
            detail = "Could not connect to vector database. Check your internet connection and try again."
        elif "quota" in error_msg or "limit" in error_msg or "rate" in error_msg:
            detail = "API rate limit reached. Wait a moment and try uploading a smaller file."
        else:
            detail = f"Failed to store document: {str(e)}"
        raise HTTPException(status_code=503, detail=detail)

    # Update BM25 index for hybrid retrieval
    if bm25_index is not None:
        bm25_items = []
        for chunk, doc_id in zip(chunks, doc_ids):
            bm25_items.append({
                "text": chunk["text"],
                "id": doc_id,
                "metadata": {"source": chunk.get("source", "unknown"), "source_type": chunk.get("source_type", "unknown"), "user_id": user_id_str}
            })
        bm25_index.add_chunks(bm25_items)
        bm25_index.save()

    # Save original file to disk for the document reader
    import uuid as _uuid
    from backend.documents.database import insert_document

    MIME_MAP = {
        ".pdf": "application/pdf",
        ".epub": "application/epub+zip",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".html": "text/html",
        ".htm": "text/html",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
    }

    storage_filename = f"{_uuid.uuid4().hex}{ext}"
    storage_path = os.path.join(UPLOADS_DIR, storage_filename)
    with open(storage_path, "wb") as f:
        f.write(content)

    user_id_int = current_user["user_id"] if current_user else None
    doc_id = await insert_document(
        filename=file.filename,
        storage_path=storage_path,
        extension=ext,
        size_bytes=len(content),
        mime_type=MIME_MAP.get(ext, "application/octet-stream"),
        user_id=user_id_int,
        project_id=project_id,
    )

    return UploadResponse(
        message=f"{ext.upper()[1:]} processed successfully",
        source=file.filename,
        chunks_created=len(chunks),
        document_id=doc_id,
    )


@app.post("/api/upload/text", response_model=UploadResponse)
async def upload_text(
    request: TextUploadRequest,
    current_user: dict = Depends(get_optional_user),
):
    """Upload direct text content."""
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    # Check content size
    if len(request.content.encode('utf-8')) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Content too large. Maximum size is {MAX_UPLOAD_SIZE_MB} MB."
        )

    components = get_components()

    # Process text
    documents = components["text"].process_text(request.content, request.title)

    # Chunk the documents
    try:
        chunks = components["chunker"].chunk_documents(documents)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Text processing failed: {str(e)}. Check for invalid characters in your content."
        )

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Text is too short (minimum ~100 words needed for meaningful search)."
        )

    # Store in vector database
    try:
        user_id_str = str(current_user["user_id"]) if current_user else None
        doc_ids = components["vector_store"].add_documents(chunks, user_id=user_id_str)
    except Exception as e:
        error_msg = str(e).lower()
        if "api" in error_msg or "key" in error_msg or "unauthorized" in error_msg:
            detail = "Vector database authentication failed. Check your PINECONE_API_KEY and COHERE_API_KEY."
        elif "timeout" in error_msg or "connection" in error_msg:
            detail = "Could not connect to vector database. Check your internet connection and try again."
        elif "quota" in error_msg or "limit" in error_msg or "rate" in error_msg:
            detail = "API rate limit reached. Wait a moment and try again with less content."
        else:
            detail = f"Failed to store text: {str(e)}"
        raise HTTPException(status_code=503, detail=detail)

    # Update BM25 index for hybrid retrieval
    if bm25_index is not None:
        bm25_items = []
        for chunk, doc_id in zip(chunks, doc_ids):
            bm25_items.append({
                "text": chunk["text"],
                "id": doc_id,
                "metadata": {"source": chunk.get("source", "unknown"), "source_type": chunk.get("source_type", "unknown"), "user_id": user_id_str}
            })
        bm25_index.add_chunks(bm25_items)
        bm25_index.save()

    return UploadResponse(
        message="Text processed successfully",
        source=request.title,
        chunks_created=len(chunks)
    )


@app.post("/api/query")
async def query(
    request: QueryRequest,
    http_request: Request,
    current_user: dict = Depends(get_optional_user),
):
    """Query the knowledge base with streaming SSE response."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    components = get_components()
    user_id_str = str(current_user["user_id"]) if current_user else None
    user_id_int = current_user["user_id"] if current_user else None
    groq_api_key = http_request.headers.get("x-groq-api-key")

    # Load chat history from conversation if conversation_id is provided
    chat_history = request.chat_history
    if request.conversation_id and user_id_int:
        if not await ConversationService.verify_ownership(request.conversation_id, user_id_int):
            raise HTTPException(status_code=404, detail="Conversation not found")
        chat_history = await ConversationService.get_recent_history(request.conversation_id)
        await ConversationService.add_message(request.conversation_id, "user", request.question)

    # Create per-request LLM instances if user provided their own Groq key
    if groq_api_key:
        from backend.llm.reasoning import LLMReasoning
        user_llm = LLMReasoning(groq_api_key=groq_api_key)
        user_route_handlers = RouteHandlers(
            vector_store=components["vector_store"],
            query_engine=components["query_engine"],
            groq_api_key=groq_api_key,
        )
    else:
        user_llm = None
        user_route_handlers = None

    async def event_stream():
        # Send immediately so HTTP response starts right away
        yield f"data: {json.dumps({'type': 'status', 'content': 'thinking'})}\n\n"

        accumulated_answer = []
        final_sources = []

        # Select route handlers: per-request (BYOK) or default singleton
        active_route_handlers = user_route_handlers or components.get("route_handlers")

        # Use query routing if enabled
        if ENABLE_QUERY_ROUTING and components["query_router"] is not None and active_route_handlers is not None:
            route_result = await components["query_router"].classify(
                request.question,
                chat_history=chat_history
            )

            async for event in active_route_handlers.handle_stream(
                route_type=route_result.route_type,
                query=request.question,
                top_k=request.top_k,
                threshold=request.threshold,
                source_filter=request.source_filter,
                rewritten_query=route_result.rewritten_query,
                user_id=user_id_str
            ):
                if event.get("type") == "token":
                    accumulated_answer.append(event.get("content", ""))
                elif event.get("type") == "done":
                    final_sources = event.get("sources", [])
                yield f"data: {json.dumps(event)}\n\n"
        else:
            # Fallback: stream via query engine LLM
            qe = components["query_engine"]
            chunks, reranked = qe.retrieve(
                question=request.question,
                top_k=request.top_k,
                threshold=request.threshold,
                source_filter=request.source_filter,
                user_id=user_id_str
            )
            # Use per-request LLM if available, otherwise default
            active_llm = user_llm or qe.llm
            async for event in active_llm.generate_response_stream(
                query=request.question,
                chunks=chunks
            ):
                if event.get("type") == "token":
                    accumulated_answer.append(event.get("content", ""))
                elif event.get("type") == "done":
                    final_sources = event.get("sources", [])
                yield f"data: {json.dumps(event)}\n\n"

        # Save assistant response to conversation if conversation_id provided
        if request.conversation_id and user_id_int:
            full_answer = "".join(accumulated_answer)
            await ConversationService.add_message(
                request.conversation_id, "assistant", full_answer, final_sources
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/conversations")
async def create_conversation(current_user: dict = Depends(get_current_user)):
    """Create a new conversation."""
    conv_id = await ConversationService.create_conversation(current_user["user_id"])
    return {"conversation_id": conv_id}


@app.get("/api/conversations")
async def list_conversations(current_user: dict = Depends(get_current_user)):
    """List all conversations for the current user."""
    return await ConversationService.get_conversations(current_user["user_id"])


@app.get("/api/conversations/{conv_id}/messages")
async def get_messages(conv_id: int, current_user: dict = Depends(get_current_user)):
    """Get all messages in a conversation."""
    if not await ConversationService.verify_ownership(conv_id, current_user["user_id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return await ConversationService.get_messages(conv_id)


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a conversation and all its messages."""
    deleted = await ConversationService.delete_conversation(conv_id, current_user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation deleted"}


@app.get("/api/sources", response_model=List[SourceResponse])
async def get_sources(current_user: dict = Depends(get_optional_user)):
    """Get all ingested sources for the current user."""
    components = get_components()
    user_id_str = str(current_user["user_id"]) if current_user else None
    sources = components["vector_store"].get_all_sources(user_id=user_id_str)
    return [SourceResponse(**s) for s in sources]


@app.get("/api/sources/{source_name}/content")
async def get_source_content(
    source_name: str,
    current_user: dict = Depends(get_optional_user),
):
    """Get all chunks/content for a specific source document."""
    components = get_components()
    user_id_str = str(current_user["user_id"]) if current_user else None
    chunks = components["vector_store"].get_chunks_by_source(source_name, user_id=user_id_str)

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
    current_user: dict = Depends(get_optional_user),
):
    """Delete all documents from a specific source."""
    components = get_components()
    user_id_str = str(current_user["user_id"]) if current_user else None
    deleted = components["vector_store"].delete_by_source(source_name, user_id=user_id_str)

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
    current_user: dict = Depends(get_optional_user),
):
    """Get a specific chunk with surrounding context."""
    components = get_components()
    result = components["vector_store"].get_chunk_with_context(
        chunk_id=chunk_id,
        context_size=context_size
    )

    if not result:
        raise HTTPException(status_code=404, detail="Chunk not found")

    return result


@app.get("/api/stats")
async def get_stats(current_user: dict = Depends(get_optional_user)):
    """Get knowledge base statistics."""
    components = get_components()
    sources = components["vector_store"].get_all_sources()
    total_chunks = components["vector_store"].count()

    return {
        "total_sources": len(sources),
        "total_chunks": total_chunks,
        "supported_formats": list(SUPPORTED_EXTENSIONS.keys()),
        "epub_available": is_ebooklib_available(),
        "docx_available": is_docx_available(),
        "html_available": is_html_available()
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
