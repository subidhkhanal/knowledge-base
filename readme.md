# Personal Knowledge Base

A full-stack RAG system that turns your documents, AI conversations, and web articles into a searchable, queryable knowledge base — with an autonomous research agent that writes long-form articles from scratch.

**[Live Demo](https://personal-assistant-indol-omega.vercel.app)** | **[API](https://personal-assistant-production.up.railway.app/health)**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│  Chat (RAG / LLM / Research)  ·  Article Reader  ·  Projects   │
└────────────────────────────┬────────────────────────────────────┘
                             │ SSE streaming + REST
┌────────────────────────────▼────────────────────────────────────┐
│                        Backend (FastAPI)                         │
│                                                                  │
│  ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐ │
│  │  Ingestion  │   │  RAG Pipeline    │   │ Research Agent   │ │
│  │  PDF/EPUB   │   │  Query Router    │   │  Planner         │ │
│  │  DOCX/HTML  │──►│  Hybrid Retriev. │   │  Researcher      │ │
│  │  TXT/MD     │   │  Cohere Rerank   │   │  Analyzer        │ │
│  └─────────────┘   └──────────────────┘   │  Writer          │ │
│                                            └──────────────────┘ │
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

### Knowledge Flywheel
The research agent searches the personal knowledge base *first* before going to the web. As you publish more articles, future research runs build on what's already been written — the PKB improves itself with each use.

### 4-Phase Autonomous Research Agent
Research runs as a structured pipeline across four LLM calls with separate concerns: planning subtopics and article structure, executing web + PKB search per subtopic, analyzing for themes/contradictions/gaps, then writing section-by-section with continuity context. Each phase streams progress events to the frontend via SSE.

### SSE Streaming Throughout
All long-running operations (RAG queries, research, ingestion status) stream results as Server-Sent Events. The frontend consumes token streams with a queue-based drain interval for smooth character-by-character rendering without layout thrash.

### Lazy-Loaded Components
All external API clients (Pinecone, Cohere, Groq) are initialized on first request via `get_components()` rather than at startup. This means the server is immediately available, failures are scoped to individual requests, and development works without all API keys configured.

### Per-User Vector Isolation
All vectors stored in a shared Pinecone index carry a `user_id` metadata field. Every query and delete operation filters by this field — multiple users share one index without ever accessing each other's data.

---

## Features

### RAG Chat — Three Modes

**RAG mode** retrieves the most relevant chunks from your knowledge base and grounds the LLM response in them. Sources are returned alongside the answer with chunk-level citations.

**LLM mode** bypasses retrieval entirely — useful for general reasoning, drafting, or questions that don't need your documents.

**Research mode** triggers the autonomous research agent, which plans, searches, writes, and publishes a full article while streaming phase-by-phase progress back to you.

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

### Article Publishing Pipeline

Conversations and web content are converted into structured, searchable articles:

```
Input (conversation or web content)
  ↓
Groq LLM structurer → markdown + HTML (multi-call for long content)
  ↓
Recursive chunker (800 tokens, 150 overlap)
  ↓
Cohere embeddings → Pinecone upsert
  ↓
BM25 index update
  ↓
PostgreSQL: slug, title, markdown, HTML, tags, project_id
```

Published articles are immediately queryable via RAG and browsable in the article reader.

### Autonomous Research Agent

The research agent runs as a 4-phase pipeline, producing a complete long-form article on any topic by combining your personal knowledge base with live web search.

```
User query + quality preset
        ↓
┌───────────────┐
│   PLANNER     │  Groq LLM → structured JSON plan
│               │  title, subtitle, 5–20 subtopics, outline, tone
└───────┬───────┘
        ↓
┌───────────────┐
│  RESEARCHER   │  For each subtopic (sequential):
│               │  1. PKB hybrid retrieval (knowledge flywheel)
│               │  2. Tavily web search (advanced depth, top 5 results)
│               │  3. Full content extraction from top 3 URLs
└───────┬───────┘
        ↓
┌───────────────┐
│   ANALYZER    │  Groq LLM → section writing briefs
│               │  Identifies: themes, contradictions, gaps, strongest sources
│               │  Respects 11K TPM Groq free-tier budget
└───────┬───────┘
        ↓
┌───────────────┐
│    WRITER     │  Groq LLM → intro + sections + conclusion
│               │  Continuity context: last 3 sections as rolling window
│               │  Retry logic with 3s backoff on failed sections
└───────┬───────┘
        ↓
Chunk → embed → Pinecone + BM25 + PostgreSQL
(article instantly searchable after generation)
```

**Quality presets:**

| Preset | Subtopics | Word Scale | Use When |
|--------|-----------|------------|----------|
| `quick` | 3–6 | 0.3x | Fast overview, ~3 min |
| `standard` | 5–15 | 1.0x | Default depth, ~8 min |
| `deep` | 8–20 | 1.8x | Comprehensive research, ~20 min |

**Rate limiting:** 2-second minimum between Groq calls enforces the 30 RPM free-tier limit without dropping requests.

### Project Organization

Group related articles and documents into projects. RAG queries can be scoped to a single project (`POST /api/projects/{slug}/query`), filtering retrieval to only that project's content.

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
| Web Search | Tavily | Research-optimized, full content extraction |
| Query Routing | LangChain LCEL | Composable, typed routing chains |
| Frontend | Next.js 16 + React 19 + Tailwind v4 | App Router, SWR caching, streaming |
| Hosting | Railway (backend) + Vercel (frontend) | Zero-config deploys, free tier |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Free API keys: [Groq](https://console.groq.com) · [Pinecone](https://pinecone.io) · [Cohere](https://cohere.com) · [Supabase](https://supabase.com)
- Optional: [Tavily](https://tavily.com) for research agent

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

**Search & Research**

| Variable | Required | Description |
|----------|----------|-------------|
| `TAVILY_API_KEY` | No | Required for research agent |

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
| POST | `/api/query` | RAG/LLM query — streams `token` events then `done` with sources |
| POST | `/api/projects/{slug}/query` | Same, scoped to one project |

### Articles

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/publish` | Publish conversation as article |
| POST | `/api/publish/web-article` | Publish web article |
| GET | `/api/articles` | List all articles |
| GET | `/api/articles/{slug}` | Get article with markdown + HTML |
| PUT | `/api/articles/{slug}` | Update article |
| DELETE | `/api/articles/{slug}` | Delete article and its vectors |
| POST | `/api/articles/{slug}/reprocess` | Regenerate HTML for article |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{slug}` | Get project with articles and documents |
| PUT | `/api/projects/{slug}` | Update project |
| DELETE | `/api/projects/{slug}` | Delete project |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/{id}/messages` | Get messages |
| DELETE | `/api/conversations/{id}` | Delete conversation |

### Research (SSE)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/research/stream` | Start research — streams `progress` events then `complete` |

**Research request:**
```json
{
  "topic": "string",
  "project_slug": "optional-project",
  "quality": "quick | standard | deep"
}
```

**SSE event types:**
```json
{"type": "progress", "phase": "planning|researching|analyzing|writing|storing", "step": 3, "total": 12, "message": "..."}
{"type": "complete", "slug": "...", "title": "...", "word_count": 8400, "sources_count": 24}
{"type": "error", "message": "..."}
```

---

## Project Structure

```
personal-assistant/
├── requirements.txt
├── railway.toml              # Railway deployment (nixpacks, healthcheck path)
├── backend/
│   ├── main.py               # FastAPI app, lifespan, component initialization
│   ├── config.py             # All env vars and tunable constants
│   ├── auth/
│   │   ├── dependencies.py   # get_current_user(), JWT validation
│   │   └── database.py       # init_db(), creates all tables on startup
│   ├── articles/
│   │   ├── routes.py         # Publish, list, get, update, delete endpoints
│   │   ├── structurer.py     # Groq LLM: conversation → structured markdown
│   │   └── html_generator.py # Groq LLM: markdown → display HTML
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
│   ├── research/
│   │   ├── agent.py          # Pipeline orchestrator, quality presets
│   │   ├── planner.py        # Phase 1: topic → subtopics + outline
│   │   ├── researcher.py     # Phase 2: PKB + Tavily per subtopic
│   │   ├── analyzer.py       # Phase 3: synthesis + writing briefs
│   │   ├── writer.py         # Phase 4: section-by-section writing
│   │   ├── prompts.py        # All LLM system prompts
│   │   └── routes.py         # SSE streaming endpoint
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
        │   ├── projects/[slug]/articles/[slug]/page.tsx  # Article reader
        │   ├── projects/[slug]/documents/[id]/page.tsx   # Document viewer
        │   └── research/[slug]/page.tsx              # Research article reader
        ├── components/
        │   ├── ChatWidget.tsx        # Resizable side panel, 3 modes, SSE consumer
        │   ├── ChatArea.tsx          # Smart auto-scroll message display
        │   ├── ChatInput.tsx         # Mode selector, research depth, auto-resize
        │   ├── MessageBubble.tsx     # Markdown rendering + source citations
        │   ├── ProjectsView.tsx      # Project grid with create/delete
        │   ├── UploadModal.tsx       # File upload with drag-drop + progress
        │   ├── PdfViewer.tsx         # PDF reader (dynamic import, no SSR)
        │   ├── EbookViewer.tsx       # EPUB reader
        │   └── TableOfContents.tsx   # Auto-generated TOC for research articles
        └── hooks/
            ├── useApi.ts             # Base fetch wrapper + XHR streaming
            ├── useChatHistory.ts     # localStorage conversation management
            ├── useProjects.ts        # SWR project/article/document CRUD
            ├── useArticles.ts        # SWR article fetching
            └── useUpload.ts          # Upload with progress tracking
```

---
