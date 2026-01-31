import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

from backend.ingestion import (
    PDFProcessor, Chunker, TextProcessor, is_whisper_available,
    EPUBProcessor, is_ebooklib_available,
    DOCXProcessor, is_docx_available,
    HTMLProcessor, is_html_available
)
from backend.storage import VectorStore
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


def get_components():
    global pdf_processor, text_processor, epub_processor, docx_processor, html_processor
    global chunker, vector_store, query_engine
    if pdf_processor is None:
        pdf_processor = PDFProcessor()
        text_processor = TextProcessor()
        chunker = Chunker()
        vector_store = VectorStore()
        query_engine = QueryEngine()
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
        "query_engine": query_engine
    }


# Lazy load audio processor (requires Whisper)
audio_processor = None


def get_audio_processor():
    global audio_processor
    if audio_processor is None:
        if is_whisper_available():
            from backend.ingestion import AudioProcessor
            audio_processor = AudioProcessor()
        else:
            raise HTTPException(
                status_code=503,
                detail="Whisper is not installed. Install with: pip install openai-whisper"
            )
    return audio_processor


# Request/Response models
class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    threshold: float = 0.3
    source_filter: Optional[str] = None


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
            "upload_pdf": "POST /api/upload/pdf",
            "upload_audio": "POST /api/upload/audio",
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


@app.post("/api/upload/pdf", response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and process a PDF file for the authenticated user."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    user_id = current_user["user_id"]
    components = get_components()
    content = await file.read()

    # Extract text from PDF
    documents = components["pdf"].process_bytes(content, file.filename)

    if not documents:
        raise HTTPException(status_code=400, detail="No text could be extracted from the PDF")

    # Chunk the documents
    chunks = components["chunker"].chunk_documents(documents)

    # Store in vector database with user_id
    components["vector_store"].add_documents(chunks, user_id=user_id)

    return UploadResponse(
        message="PDF processed successfully",
        source=file.filename,
        chunks_created=len(chunks)
    )


@app.post("/api/upload/audio", response_model=UploadResponse)
async def upload_audio(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and transcribe an audio file for the authenticated user."""
    allowed_extensions = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"}
    ext = "." + file.filename.lower().split(".")[-1] if "." in file.filename else ""

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(allowed_extensions)}"
        )

    user_id = current_user["user_id"]
    processor = get_audio_processor()
    content = await file.read()

    # Transcribe audio
    documents = processor.process_bytes(content, file.filename)

    if not documents:
        raise HTTPException(status_code=400, detail="No text could be transcribed from the audio")

    components = get_components()

    # Chunk the documents
    chunks = components["chunker"].chunk_documents(documents)

    # Store in vector database with user_id
    components["vector_store"].add_documents(chunks, user_id=user_id)

    return UploadResponse(
        message="Audio transcribed and processed successfully",
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

    return QueryResponse(**result)


@app.get("/api/sources", response_model=List[SourceResponse])
async def get_sources(current_user: dict = Depends(get_current_user)):
    """Get all ingested sources for the authenticated user."""
    user_id = current_user["user_id"]
    components = get_components()
    sources = components["vector_store"].get_all_sources(user_id=user_id)
    return [SourceResponse(**s) for s in sources]


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
        "whisper_available": is_whisper_available(),
        "epub_available": is_ebooklib_available(),
        "docx_available": is_docx_available(),
        "html_available": is_html_available()
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
