from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

from backend.ingestion import PDFProcessor, Chunker, TextProcessor, is_whisper_available
from backend.storage import VectorStore
from backend.retrieval import QueryEngine

app = FastAPI(
    title="Personal Knowledge Base API",
    description="RAG system for querying personal content",
    version="1.0.0"
)

# CORS for frontend (allow all origins for deployment)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-load heavy components to speed up startup
pdf_processor = None
text_processor = None
chunker = None
vector_store = None
query_engine = None


def get_components():
    global pdf_processor, text_processor, chunker, vector_store, query_engine
    if pdf_processor is None:
        pdf_processor = PDFProcessor()
        text_processor = TextProcessor()
        chunker = Chunker()
        vector_store = VectorStore()
        query_engine = QueryEngine()
    return pdf_processor, text_processor, chunker, vector_store, query_engine


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


# Health check endpoint (responds immediately, no heavy loading)
@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Endpoints
@app.get("/")
async def root():
    return {
        "message": "Personal Knowledge Base API",
        "version": "1.0.0",
        "endpoints": {
            "health": "GET /health",
            "upload_pdf": "POST /api/upload/pdf",
            "upload_audio": "POST /api/upload/audio",
            "upload_text": "POST /api/upload/text",
            "query": "POST /api/query",
            "sources": "GET /api/sources",
            "delete_source": "DELETE /api/sources/{source_name}"
        }
    }


@app.post("/api/upload/pdf", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Upload and process a PDF file."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    pdf_proc, text_proc, chunk_proc, vec_store, _ = get_components()
    content = await file.read()

    # Extract text from PDF
    documents = pdf_proc.process_bytes(content, file.filename)

    if not documents:
        raise HTTPException(status_code=400, detail="No text could be extracted from the PDF")

    # Chunk the documents
    chunks = chunk_proc.chunk_documents(documents)

    # Store in vector database
    vec_store.add_documents(chunks)

    return UploadResponse(
        message="PDF processed successfully",
        source=file.filename,
        chunks_created=len(chunks)
    )


@app.post("/api/upload/audio", response_model=UploadResponse)
async def upload_audio(file: UploadFile = File(...)):
    """Upload and transcribe an audio file."""
    allowed_extensions = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"}
    ext = "." + file.filename.lower().split(".")[-1] if "." in file.filename else ""

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(allowed_extensions)}"
        )

    processor = get_audio_processor()
    content = await file.read()

    # Transcribe audio
    documents = processor.process_bytes(content, file.filename)

    if not documents:
        raise HTTPException(status_code=400, detail="No text could be transcribed from the audio")

    _, _, chunk_proc, vec_store, _ = get_components()

    # Chunk the documents
    chunks = chunk_proc.chunk_documents(documents)

    # Store in vector database
    vec_store.add_documents(chunks)

    return UploadResponse(
        message="Audio transcribed and processed successfully",
        source=file.filename,
        chunks_created=len(chunks)
    )


@app.post("/api/upload/text", response_model=UploadResponse)
async def upload_text(request: TextUploadRequest):
    """Upload direct text content."""
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    _, text_proc, chunk_proc, vec_store, _ = get_components()

    # Process text
    documents = text_proc.process_text(request.content, request.title)

    # Chunk the documents
    chunks = chunk_proc.chunk_documents(documents)

    # Store in vector database
    vec_store.add_documents(chunks)

    return UploadResponse(
        message="Text processed successfully",
        source=request.title,
        chunks_created=len(chunks)
    )


@app.post("/api/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """Query the knowledge base."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    _, _, _, _, q_engine = get_components()

    result = await q_engine.query(
        question=request.question,
        top_k=request.top_k,
        threshold=request.threshold,
        source_filter=request.source_filter
    )

    return QueryResponse(**result)


@app.get("/api/sources", response_model=List[SourceResponse])
async def get_sources():
    """Get all ingested sources."""
    _, _, _, vec_store, _ = get_components()
    sources = vec_store.get_all_sources()
    return [SourceResponse(**s) for s in sources]


@app.delete("/api/sources/{source_name}")
async def delete_source(source_name: str):
    """Delete all documents from a specific source."""
    _, _, _, vec_store, _ = get_components()
    deleted = vec_store.delete_by_source(source_name)

    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"Source '{source_name}' not found")

    return {
        "message": f"Deleted {deleted} chunks from '{source_name}'",
        "source": source_name,
        "chunks_deleted": deleted
    }


@app.get("/api/stats")
async def get_stats():
    """Get knowledge base statistics."""
    _, _, _, vec_store, _ = get_components()
    sources = vec_store.get_all_sources()
    total_chunks = vec_store.count()

    return {
        "total_sources": len(sources),
        "total_chunks": total_chunks,
        "whisper_available": is_whisper_available()
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
