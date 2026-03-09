# Personal Knowledge Base

A full-stack RAG (Retrieval-Augmented Generation) system that lets you build a searchable knowledge base from documents, AI conversations, and web articles. Ask questions and get AI-powered answers grounded in your own content.

**[Live Demo](https://personal-assistant-indol-omega.vercel.app)** | **[API](https://personal-assistant-backend-72zo.onrender.com/health)**

## Architecture

```
Chrome Extension ──► Frontend (Next.js) ──► Backend (FastAPI) ──► Pinecone (vectors)
  - Claude scraper       - SWR caching          - Hybrid retrieval     Cohere (embeddings)
  - ChatGPT scraper      - Article reader        - Query routing        Groq (LLM)
  - Web article scraper  - Chat interface        - Research agent       Supabase (DB + storage)
```

## Features

### RAG Pipeline
- **Hybrid Retrieval** — BM25 full-text search + Pinecone semantic search, combined via Reciprocal Rank Fusion (RRF)
- **Cohere Reranking** — Retrieved chunks reranked with `rerank-english-v3.0` for precision
- **Query Routing** — LCEL-based classifier routes queries to RAG, general LLM, or research agent
- **Streaming Responses** — Server-Sent Events for real-time answer generation with source citations

### Document Processing
- Supports **PDF**, **EPUB**, **DOCX**, **HTML**, **TXT**, and **Markdown** (up to 10 MB)
- Recursive chunking with configurable size (800 tokens) and overlap (150 tokens)
- Cohere `embed-english-v3.0` embeddings (1024 dimensions)

### Article Publishing
- Converts AI conversations into structured markdown articles
- Pipeline: Structurer → Chunker → Vector indexing → BM25 indexing → Database persistence
- Tag extraction, slug generation, and full-text search

### Deep Research Agent
- Autonomous multi-phase research using Tavily web search + PKB knowledge
- Phases: Analyze → Plan → Research → Write
- Produces long-form articles (10,000–20,000 words) with SSE progress streaming

### Project Organization
- Group articles and documents into projects
- Project-scoped RAG queries (search within a single project)

### Chrome Extension (MV3)
- Scrape conversations from **Claude** and **ChatGPT**
- Extract web articles using **Readability.js**
- One-click publish to your knowledge base

### Interoperability
- **MCP Server** — Model Context Protocol for tool-use integration
- **A2A Protocol** — Agent-to-Agent JSON-RPC with three skills: deep-research, knowledge-search, rag-qa

### Evaluation
- **RAGAS** framework for retrieval quality metrics
- Gemini 2.5 Flash as evaluation judge
- nDCG@k scoring with parameter tuning

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, Python 3.10+ |
| Database | PostgreSQL (Supabase) |
| Vector Store | Pinecone (1024-dim, Cohere embeddings) |
| LLM | Groq — `llama-3.3-70b-versatile` |
| Reranking | Cohere — `rerank-english-v3.0` |
| Search | BM25 + semantic hybrid with RRF |
| Frontend | Next.js 16, React 19, Tailwind CSS v4, SWR |
| Extension | Chrome Manifest V3 |
| Hosting | Render (backend), Vercel (frontend) |

## API Endpoints

### Health & Stats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/stats` | Knowledge base statistics |

### Documents & Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload/document` | Upload file (PDF, EPUB, DOCX, HTML, TXT, MD) |
| POST | `/api/upload/text` | Upload direct text content |
| GET | `/api/sources` | List all ingested sources |
| GET | `/api/sources/{name}/content` | Get chunks for a source |
| DELETE | `/api/sources/{name}` | Delete a source and its vectors |
| DELETE | `/api/documents/{id}` | Delete a document |
| GET | `/api/chunks/{id}` | Get chunk with surrounding context |

### Query
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/query` | RAG query with SSE streaming |

### Articles
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/publish` | Publish conversation as article |
| GET | `/api/articles` | List all articles |
| GET | `/api/articles/{slug}` | Get article detail |
| PUT | `/api/articles/{slug}` | Update article |
| DELETE | `/api/articles/{slug}` | Delete article and its vectors |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{slug}` | Get project detail with articles/documents |
| PUT | `/api/projects/{slug}` | Update project |
| DELETE | `/api/projects/{slug}` | Delete project |

### Conversations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/{id}/messages` | Get conversation messages |
| DELETE | `/api/conversations/{id}` | Delete conversation |

### Research
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/research/stream` | Start deep research (SSE streaming) |

### Interoperability
| Method | Endpoint | Description |
|--------|----------|-------------|
| — | `/mcp` | MCP Server (Model Context Protocol) |
| GET | `/.well-known/agent-card.json` | A2A Agent Card |
| POST | `/a2a` | A2A JSON-RPC handler |

## Local Development

### Prerequisites
- Python 3.10+
- Node.js 18+
- API keys: [Groq](https://console.groq.com) (free), [Pinecone](https://www.pinecone.io) (free), [Cohere](https://cohere.com) (free), [Supabase](https://supabase.com) (free)

### Backend

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Create .env (see Environment Variables below)
uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```

### Chrome Extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" and select the `extension/` folder

## Environment Variables

### Backend (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq LLM API key |
| `GROQ_MODEL` | No | Default: `llama-3.3-70b-versatile` |
| `PINECONE_API_KEY` | Yes | Pinecone vector database key |
| `PINECONE_INDEX_NAME` | No | Default: `knowledge-base` |
| `COHERE_API_KEY` | Yes | Cohere embeddings & reranking key |
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | No | Default: `uploads` |
| `JWT_SECRET_KEY` | No | Default: `dev-secret-personal-kb-local` |
| `TAVILY_API_KEY` | No | Required for research agent |
| `GOOGLE_API_KEY` | No | Required for RAGAS evaluation |
| `FRONTEND_URL` | No | Default: `http://localhost:3000` |

### Frontend (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (e.g., `http://localhost:8000`) |

## Project Structure

```
personal-assistant/
├── backend/
│   ├── main.py              # FastAPI app, routes, startup
│   ├── config.py             # Environment configuration
│   ├── auth/                 # JWT authentication
│   ├── articles/             # Article publishing pipeline
│   ├── projects/             # Project management
│   ├── conversations/        # Conversation persistence
│   ├── ingestion/            # Document processors (PDF, EPUB, DOCX, HTML, TXT)
│   ├── retrieval/            # RAG engine, BM25, hybrid retriever, reranker
│   ├── routing/              # Query classification & routing
│   ├── research/             # Deep research agent (Tavily)
│   ├── storage/              # Pinecone vector store, Supabase storage
│   ├── llm/                  # Groq LLM integration
│   ├── evaluation/           # RAGAS evaluation framework
│   ├── mcp/                  # MCP Server
│   ├── a2a/                  # A2A Protocol
│   └── db/                   # Database connection pooling
├── frontend/
│   └── src/
│       ├── app/              # Next.js App Router pages
│       ├── components/       # React components
│       ├── hooks/            # Custom hooks (SWR data fetching)
│       ├── contexts/         # Auth context
│       └── lib/              # Utilities (fetcher, etc.)
├── extension/
│   ├── manifest.json         # Chrome MV3 manifest
│   ├── popup.html/js         # Extension popup UI
│   ├── article-scraper.js    # Web article extraction
│   ├── content-scripts/      # Claude & ChatGPT scrapers
│   └── lib/                  # Readability.js
└── requirements.txt
```

## License

MIT
