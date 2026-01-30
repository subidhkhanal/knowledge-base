import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Base paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
CHROMADB_DIR = DATA_DIR / "chromadb"

# Ensure directories exist
CHROMADB_DIR.mkdir(parents=True, exist_ok=True)

# Chunking settings
CHUNK_SIZE = 800  # tokens
CHUNK_OVERLAP = 150  # tokens

# Retrieval settings
TOP_K = 5  # Number of chunks to retrieve
SIMILARITY_THRESHOLD = 0.3  # Minimum similarity score

# Hybrid search settings
USE_HYBRID_SEARCH = os.getenv("USE_HYBRID_SEARCH", "true").lower() == "true"
SEMANTIC_WEIGHT = float(os.getenv("SEMANTIC_WEIGHT", "0.5"))  # Weight for semantic search (0-1)
BM25_WEIGHT = float(os.getenv("BM25_WEIGHT", "0.5"))  # Weight for BM25 keyword search (0-1)

# LLM settings - Groq is PRIMARY (free cloud API)
# Get your free API key at https://console.groq.com
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

# Ollama is optional local fallback
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
USE_OLLAMA_FALLBACK = os.getenv("USE_OLLAMA_FALLBACK", "false").lower() == "true"

# Whisper settings (optional, requires separate installation)
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")

# Prompt template
SYSTEM_PROMPT = """You are an assistant that answers ONLY from the provided context.
If the answer is not in the context, say "I don't have this information in my knowledge base."

When answering, cite your sources using [Source: filename, page X] format."""
