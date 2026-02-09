import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import json
import uvicorn

from backend.ingestion import (
    PDFProcessor, Chunker, TextProcessor,
    EPUBProcessor, is_ebooklib_available,
    DOCXProcessor, is_docx_available,
    HTMLProcessor, is_html_available
)
from backend.storage import VectorStore
from backend.retrieval import QueryEngine
from backend.auth import get_current_user
from backend.config import MAX_UPLOAD_SIZE, MAX_UPLOAD_SIZE_MB, ENABLE_QUERY_ROUTING
from backend.routing import QueryRouter, RouteHandlers

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
query_router = None
route_handlers = None


def get_components():
    global pdf_processor, text_processor, epub_processor, docx_processor, html_processor
    global chunker, vector_store, query_engine, query_router, route_handlers

    # Initialize basic processors first (these don't require external APIs)
    if pdf_processor is None:
        pdf_processor = PDFProcessor()
        text_processor = TextProcessor()
        chunker = Chunker()
        # Initialize optional processors if available
        if is_ebooklib_available():
            epub_processor = EPUBProcessor()
        if is_docx_available():
            docx_processor = DOCXProcessor()
        if is_html_available():
            html_processor = HTMLProcessor()

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
        query_engine = QueryEngine(vector_store=vector_store)

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
        "route_handlers": route_handlers
    }


# Request/Response models
class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    threshold: float = 0.3
    source_filter: Optional[str] = None
    chat_history: Optional[List[dict]] = None


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

    # Store in vector database with user_id
    try:
        components["vector_store"].add_documents(chunks, user_id=user_id)
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

    # Check content size
    if len(request.content.encode('utf-8')) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Content too large. Maximum size is {MAX_UPLOAD_SIZE_MB} MB."
        )

    user_id = current_user["user_id"]
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

    # Store in vector database with user_id
    try:
        components["vector_store"].add_documents(chunks, user_id=user_id)
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

    return UploadResponse(
        message="Text processed successfully",
        source=request.title,
        chunks_created=len(chunks)
    )


@app.post("/api/query")
async def query(
    request: QueryRequest,
    current_user: dict = Depends(get_current_user)
):
    """Query the knowledge base with streaming SSE response."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    user_id = current_user["user_id"]
    components = get_components()

    async def event_stream():
        # Send immediately so HTTP response starts right away
        yield f"data: {json.dumps({'type': 'status', 'content': 'thinking'})}\n\n"

        # Use query routing if enabled
        if ENABLE_QUERY_ROUTING and components["query_router"] is not None:
            route_result = await components["query_router"].classify(
                request.question,
                chat_history=request.chat_history
            )

            async for event in components["route_handlers"].handle_stream(
                route_type=route_result.route_type,
                query=request.question,
                user_id=user_id,
                top_k=request.top_k,
                threshold=request.threshold,
                source_filter=request.source_filter,
                rewritten_query=route_result.rewritten_query
            ):
                yield f"data: {json.dumps(event)}\n\n"
        else:
            # Fallback: stream via query engine LLM
            qe = components["query_engine"]
            chunks, reranked = qe.retrieve(
                question=request.question,
                user_id=user_id,
                top_k=request.top_k,
                threshold=request.threshold,
                source_filter=request.source_filter
            )
            async for event in qe.llm.generate_response_stream(
                query=request.question,
                chunks=chunks
            ):
                yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
