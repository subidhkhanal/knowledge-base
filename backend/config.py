import os
import uuid
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Base paths
BASE_DIR = Path(__file__).parent.parent

# JWT Authentication
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-personal-kb-local")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

# SQLite
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", str(BASE_DIR / "data" / "app.db"))

# Upload settings
MAX_UPLOAD_SIZE_MB = 10
MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024  # 10 MB in bytes
UPLOADS_DIR = os.getenv("UPLOADS_DIR", str(BASE_DIR / "data" / "uploads"))

# Chunking settings
CHUNK_SIZE = 800  # tokens
CHUNK_OVERLAP = 150  # tokens
CHUNKING_METHOD = os.getenv("CHUNKING_METHOD", "recursive")  # "linear" or "recursive"

# Hybrid retrieval
USE_HYBRID_RETRIEVAL = os.getenv("USE_HYBRID_RETRIEVAL", "true").lower() == "true"
RRF_K = int(os.getenv("RRF_K", "60"))

# Retrieval settings
TOP_K = 5  # Number of chunks to retrieve
SIMILARITY_THRESHOLD = 0.3  # Minimum similarity score

# Pinecone settings (free tier: 100K vectors, 1 index)
# Get your free API key at https://app.pinecone.io
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "knowledge-base")

# Cohere settings (free tier: 1000 req/month for rerank, embed has separate limits)
# Get your free API key at https://dashboard.cohere.com/api-keys
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")

# Embedding settings (using Cohere API)
COHERE_EMBED_MODEL = os.getenv("COHERE_EMBED_MODEL", "embed-english-v3.0")
COHERE_EMBED_DIMENSION = 1024  # embed-english-v3.0 dimension

# API timeout settings (in seconds)
API_TIMEOUT = float(os.getenv("API_TIMEOUT", "30.0"))  # Default timeout for external APIs

# Re-ranking settings
USE_RERANKING = os.getenv("USE_RERANKING", "true").lower() == "true"
RERANK_MODEL = os.getenv("RERANK_MODEL", "rerank-english-v3.0")
RERANK_TOP_K = int(os.getenv("RERANK_TOP_K", "5"))  # Final number of results after reranking

# LLM settings - Groq (free cloud API)
# Get your free API key at https://console.groq.com
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# LLM generation settings
LLM_MAX_TOKENS = 2048  # Max response tokens
LLM_TEMPERATURE = 0.3  # Lower = more focused, higher = more creative
LLM_TIMEOUT = 60.0  # Timeout in seconds for LLM API calls

# Query Router settings
ENABLE_QUERY_ROUTING = os.getenv("ENABLE_QUERY_ROUTING", "true").lower() == "true"
ROUTER_TEMPERATURE = 0.1  # Low temperature for consistent classification

# Prompt template
SYSTEM_PROMPT = """You are a knowledgeable assistant for a personal document library. Answer questions using ONLY the provided context passages.

Rules:
1. Base your answer entirely on the provided context. If the context doesn't fully answer the question, say what you can and note what's missing.
2. When synthesizing from multiple passages, integrate the information naturally rather than summarizing each passage separately.
3. If passages contain conflicting information, acknowledge the conflict and present both perspectives with their sources.
4. Use structured formatting (bullet points, numbered lists) when the answer has multiple components.
5. Never fabricate information not present in the context.
6. Do NOT include source citations in your answer - sources are displayed separately in the UI."""
