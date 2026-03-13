# Personal Knowledge Base

A full-stack RAG system that turns your documents into a searchable, queryable knowledge base.

**[Live Demo](https://personal-assistant-indol-omega.vercel.app)** | **[API](https://d3kmysbupw.us-east-2.awsapprunner.com/health)**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│  Chat (RAG)  ·  Document Reader  ·  Projects                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ SSE streaming + REST
┌────────────────────────────▼────────────────────────────────────┐
│                        Backend (FastAPI)                         │
│                                                                  │
│  ┌─────────────┐   ┌──────────────────┐                        │
│  │  Ingestion  │   │  RAG Pipeline    │                        │
│  │  PDF/EPUB   │   │  Query Router    │                        │
│  │  DOCX/HTML  │──►│  Hybrid Retriev. │                        │
│  │  TXT/MD     │   │  Cohere Rerank   │                        │
│  └─────────────┘   └──────────────────┘                        │
└──────┬──────────────────────┬───────────────────────────────────┘
       │                      │
  ┌────▼────┐   ┌─────────────▼──────────────────────────┐
  │Supabase │   │  Pinecone (vectors)  ·  PostgreSQL (DB) │
  │(files)  │   │  Cohere (embeddings) ·  BM25 (sparse)   │
  └─────────┘   └─────────────────────────────────────────┘
```

---

## Technical Highlights

### Hybrid Retrieval with Reciprocal Rank Fusion
Two retrieval strategies run in parallel on every query: BM25 for exact lexical matching and Pinecone dense vectors for semantic similarity. Results are merged using **Reciprocal Rank Fusion** (`score = 1 / (k + rank)`, k=60), which consistently outperforms either method alone without requiring manual weight tuning. A Cohere `rerank-english-v3.0` pass then reorders the fused candidates for final precision.

### SSE Streaming Throughout
All long-running operations (RAG queries, ingestion status) stream results as Server-Sent Events. The frontend consumes token streams with a queue-based drain interval for smooth character-by-character rendering without layout thrash.

### Lazy-Loaded Components
All external API clients (Pinecone, Cohere, Groq) are initialized on first request via `get_components()` rather than at startup. This means the server is immediately available, failures are scoped to individual requests, and development works without all API keys configured.

### Per-User Vector Isolation
All vectors stored in a shared Pinecone index carry a `user_id` metadata field. Every query and delete operation filters by this field — multiple users share one index without ever accessing each other's data.

---

## Features

### RAG Chat

Retrieves the most relevant chunks from your knowledge base and grounds the LLM response in them. Sources are returned alongside the answer with chunk-level citations.

### Document Ingestion

Upload files up to 10 MB in any of the supported formats:

| Format | Processor | Notes |
|--------|-----------|-------|
| PDF | pdfplumber | Text + tables, per-page metadata |
| EPUB | ebooklib | Chapter-level extraction |
| DOCX | python-docx | Paragraphs + tables |
| HTML | BeautifulSoup | Readable content extraction |
| TXT / MD / Markdown | Built-in | Multi-encoding (UTF-8, latin-1, cp1252) |

Processing pipeline: extract → recursive-chunk (800 tokens, 150 overlap) → embed (Cohere 1024-dim) → upsert to Pinecone + BM25 index → store metadata in PostgreSQL.

### Hybrid Retrieval Pipeline

```
Query
  ↓
Cohere embed-english-v3.0 (1024-dim)
  ├── Pinecone ANN search (dense, cosine)     ─┐
  └── BM25 in-memory index (sparse, lexical)  ─┤ Reciprocal Rank Fusion
                                                ↓
                                         Merged candidates
                                                ↓
                              Cohere rerank-english-v3.0
                                                ↓
                                         Top-k chunks → LLM
```

Configuration (all tunable via env):
- `TOP_K = 5` — initial retrieval count
- `SIMILARITY_THRESHOLD = 0.3` — minimum cosine score
- `RRF_K = 60` — rank fusion parameter
- `RERANK_TOP_K = 5` — final results after reranking

### Project Organization

Group related documents into projects. RAG queries can be scoped to a single project (`POST /api/projects/{slug}/query`), filtering retrieval to only that project's content.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | FastAPI + Python 3.10+ | Async-native, SSE support, fast iteration |
| Database | PostgreSQL via Supabase | Managed hosting, row-level security, file storage |
| Vector Store | Pinecone | Serverless, metadata filtering, free 100K vectors |
| Embeddings | Cohere `embed-english-v3.0` | 1024-dim, strong multilingual quality |
| Reranking | Cohere `rerank-english-v3.0` | Cross-encoder precision on top of ANN recall |
| LLM | Groq `llama-3.3-70b-versatile` | Free tier, 70B quality, fast inference |
| Sparse Retrieval | rank-bm25 | In-memory, zero-latency lexical search |
| Query Routing | LangChain LCEL | Composable, typed routing chains |
| Frontend | Next.js 16 + React 19 + Tailwind v4 | App Router, SWR caching, streaming |
| Hosting | AWS App Runner (backend) + Vercel (frontend) | Auto-scaling containers, HTTPS, health checks |
| Observability | LangSmith | LLM tracing, token usage, latency monitoring |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Free API keys: [Groq](https://console.groq.com) · [Pinecone](https://pinecone.io) · [Cohere](https://cohere.com) · [Supabase](https://supabase.com)

### Backend

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Copy and fill in your .env (see environment variables below)
cp .env.example .env

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

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

### Backend — AWS App Runner

The backend runs as a containerized Python service on AWS App Runner with auto-scaling (1–25 instances), HTTP health checks, and zero-downtime deployments.

```
GitHub (main branch)
  ↓  Source code repository
AWS App Runner
  ├── Build: pip3 install -t . -r requirements.txt
  ├── Start: python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
  ├── Health: HTTP GET /health
  └── Env vars: configured via App Runner console (secrets never in repo)
```

### Frontend — Vercel

The Next.js frontend deploys automatically on every push via Vercel's GitHub integration. The `NEXT_PUBLIC_API_URL` environment variable points to the App Runner backend URL.

---

## Environment Variables

### Backend (`.env`)

**Database & Storage**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | No | Default: `uploads` |

**Vector Store**

| Variable | Required | Description |
|----------|----------|-------------|
| `PINECONE_API_KEY` | Yes | Pinecone API key |
| `PINECONE_INDEX_NAME` | No | Default: `knowledge-base` |

**Embeddings & Reranking**

| Variable | Required | Description |
|----------|----------|-------------|
| `COHERE_API_KEY` | Yes | Cohere API key (embeddings + reranking) |

**LLM**

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key |
| `GROQ_MODEL` | No | Default: `llama-3.3-70b-versatile` |

**App Config**

| Variable | Required | Description |
|----------|----------|-------------|
| `FRONTEND_URL` | No | Default: `http://localhost:3000` (CORS) |
| `CHUNKING_METHOD` | No | `recursive` (default) or `linear` |
| `USE_HYBRID_RETRIEVAL` | No | Default: `true` |
| `USE_RERANKING` | No | Default: `true` |
| `ENABLE_QUERY_ROUTING` | No | Default: `true` |

### Frontend (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (e.g., `http://localhost:8000`) |

---

## API Reference

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check — no auth, no component load |
| POST | `/api/stats` | Knowledge base stats (chunk count, source count) |

### Upload & Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload/document` | Upload file (PDF, EPUB, DOCX, HTML, TXT, MD) |
| POST | `/api/upload/text` | Upload direct text content |
| GET | `/api/sources` | List all ingested sources |
| GET | `/api/sources/{name}/content` | Get all chunks from a source |
| DELETE | `/api/sources/{name}` | Delete source and its vectors |
| DELETE | `/api/documents/{id}` | Delete document (DB + Pinecone + Supabase) |
| GET | `/api/documents/{id}` | Get document metadata |
| GET | `/api/documents/{id}/file` | Download original file |
| GET | `/api/chunks/{id}` | Get chunk with surrounding context |

### Query (SSE)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/query` | RAG query — streams `token` events then `done` with sources |
| POST | `/api/projects/{slug}/query` | Same, scoped to one project |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{slug}` | Get project with documents |
| PUT | `/api/projects/{slug}` | Update project |
| DELETE | `/api/projects/{slug}` | Delete project |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/{id}/messages` | Get messages |
| DELETE | `/api/conversations/{id}` | Delete conversation |

---

## Project Structure

```
personal-assistant/
├── requirements.txt
├── backend/
│   ├── main.py               # FastAPI app, lifespan, component initialization
│   ├── config.py             # All env vars and tunable constants
│   ├── auth/
│   │   ├── dependencies.py   # get_current_user(), demo mode auth
│   │   └── database.py       # init_db(), creates all tables on startup
│   ├── projects/
│   │   └── routes.py         # Project CRUD + scoped query endpoint
│   ├── conversations/
│   │   └── routes.py         # Conversation and message persistence
│   ├── ingestion/
│   │   ├── pdf_processor.py
│   │   ├── epub_processor.py
│   │   ├── docx_processor.py
│   │   ├── html_processor.py
│   │   ├── text_processor.py
│   │   ├── chunker.py        # Linear token chunker
│   │   └── recursive_chunker.py
│   ├── retrieval/
│   │   ├── query_engine.py   # Main RAG orchestrator
│   │   ├── hybrid_retriever.py  # BM25 + Pinecone + RRF
│   │   └── reranker.py       # Cohere reranking
│   ├── routing/
│   │   └── query_router.py   # LCEL-based query classifier
│   ├── storage/
│   │   └── vector_store.py   # Pinecone client, embed, upsert, query, delete
│   ├── llm/
│   │   └── reasoning.py      # Groq client, streaming, sync/async wrappers
│   └── db/
│       └── connection.py     # asyncpg pool management
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx                              # Projects grid (home)
        │   ├── projects/[slug]/page.tsx              # Project detail
        │   ├── projects/[slug]/documents/[id]/page.tsx   # Document viewer
        │   └── settings/page.tsx                     # Reading preferences
        ├── components/
        │   ├── ChatWidget.tsx        # Resizable side panel, SSE consumer
        │   ├── ChatArea.tsx          # Smart auto-scroll message display
        │   ├── ChatInput.tsx         # Text input with auto-resize
        │   ├── MessageBubble.tsx     # Markdown rendering + source citations
        │   ├── ProjectsView.tsx      # Project grid with create/delete
        │   ├── UploadModal.tsx       # File upload with drag-drop + progress
        │   ├── PdfViewer.tsx         # PDF reader (dynamic import, no SSR)
        │   └── EbookViewer.tsx       # EPUB reader
        └── hooks/
            ├── useApi.ts             # Base fetch wrapper + XHR streaming
            ├── useChatHistory.ts     # localStorage conversation management
            ├── useProjects.ts        # SWR project/document CRUD
            └── useUpload.ts          # Upload with progress tracking
```

---
