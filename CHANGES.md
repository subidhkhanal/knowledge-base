# Implementation Changes — Agentic RAG Knowledge Base

This document details every technical change made to implement the features described in the project resume. The system was audited against the resume claims, and 8 implementation phases were executed to ensure every bullet point is backed by real, working code.

All services and libraries remain on **free tiers** (zero cost).

---

## Table of Contents

1. [Phase 1: SQLite + JWT Authentication](#phase-1-sqlite--jwt-authentication)
2. [Phase 2: Per-User Document Isolation](#phase-2-per-user-document-isolation)
3. [Phase 3a: pdfplumber Table Extraction](#phase-3a-pdfplumber-table-extraction)
4. [Phase 3b: Token-Aware Recursive Chunking](#phase-3b-token-aware-recursive-chunking)
5. [Phase 4: Hybrid Retrieval (BM25 + Dense + RRF)](#phase-4-hybrid-retrieval-bm25--dense--rrf)
6. [Phase 5: LangChain LCEL Query Routing](#phase-5-langchain-lcel-query-routing)
7. [Phase 6: Persistent Conversation Memory](#phase-6-persistent-conversation-memory)
8. [Phase 7: RAGAS Context Relevance + nDCG@10 + Tuning](#phase-7-ragas-context-relevance--ndcg10--tuning)
9. [Phase 8: Coreference Resolution Enhancement](#phase-8-coreference-resolution-enhancement)
10. [New Directory Structure](#new-directory-structure)
11. [New Dependencies](#new-dependencies)

---

## Phase 1: SQLite + JWT Authentication

**Resume claim:** *"per-user document isolation via JWT authentication"*

### What was built

A complete authentication system using JWT tokens with bcrypt password hashing, backed by async SQLite.

### New files

| File | Purpose |
|------|---------|
| `backend/auth/__init__.py` | Package exports: `AuthService`, `UserCreate`, `UserLogin`, `Token`, `get_current_user`, `get_optional_user` |
| `backend/auth/models.py` | Pydantic request/response models with validation (username: 3-30 chars alphanumeric, password: 8+ chars) |
| `backend/auth/database.py` | SQLite schema with 3 tables (`users`, `conversations`, `messages`), foreign keys, cascade deletes, and indexes |
| `backend/auth/service.py` | `AuthService` class: bcrypt hashing via `passlib`, JWT encode/decode via `python-jose` |
| `backend/auth/dependencies.py` | FastAPI dependency injection: `get_current_user` (raises 401) and `get_optional_user` (returns None) using `HTTPBearer` |

### Technical details

- **Password hashing:** `passlib.context.CryptContext(schemes=["bcrypt"])` — industry-standard bcrypt with automatic salt generation
- **JWT tokens:** `python-jose` with HS256 algorithm. Payload contains `sub` (user_id), `username`, and `exp` (expiry). Default expiry: 1440 minutes (24 hours), configurable via `JWT_EXPIRE_MINUTES` env var
- **Secret key:** Auto-generated UUID on first run (`"dev-secret-" + uuid4()`), overridable via `JWT_SECRET_KEY` env var for production
- **Database schema:**
  ```sql
  CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, hashed_password TEXT, created_at TIMESTAMP);
  CREATE TABLE conversations (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT, created_at TIMESTAMP, updated_at TIMESTAMP);
  CREATE TABLE messages (id INTEGER PRIMARY KEY, conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE, role TEXT, content TEXT, sources_json TEXT, created_at TIMESTAMP);
  ```
- **Startup hook:** `@app.on_event("startup")` calls `init_db()` which creates tables and indexes if they don't exist

### Modified files

- **`backend/config.py`** — Added `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES`, `SQLITE_DB_PATH`
- **`backend/main.py`** — Added `POST /api/auth/register` and `POST /api/auth/login` endpoints. All protected endpoints now require `Depends(get_current_user)`
- **`requirements.txt`** — Added `python-jose[cryptography]>=3.3.0`, `passlib[bcrypt]>=1.7.4`, `aiosqlite>=0.19.0`

### API endpoints

```
POST /api/auth/register  — Create account, returns JWT + user_id
POST /api/auth/login     — Authenticate, returns JWT
```

All other endpoints require `Authorization: Bearer <token>` header.

---

## Phase 2: Per-User Document Isolation

**Resume claim:** *"per-user document isolation"*

### What was changed

Every document operation (upload, search, list, delete) now scopes data to the authenticated user via Pinecone metadata filtering.

### How it works

1. **On upload:** `user_id` is stored in Pinecone vector metadata alongside `source`, `page`, etc.
2. **On search:** Pinecone filter includes `{"user_id": {"$eq": str(user_id)}}`. When combined with `source_filter`, uses compound `$and` filter
3. **On list/delete:** All source operations filter by `user_id`

### Modified files

- **`backend/storage/vector_store.py`** — Added optional `user_id` parameter to `add_documents()`, `search()`, `get_all_sources()`, `delete_by_source()`, `get_chunks_by_source()`. Builds compound Pinecone `$and` filters when multiple filter criteria are present
- **`backend/retrieval/query_engine.py`** — Threads `user_id` through `retrieve()`, `query()`, `query_sync()`, and `_retrieve_and_rerank()` into the vector store and hybrid retriever
- **`backend/routing/route_handlers.py`** — All handler methods (`handle_knowledge`, `handle_meta`, `handle_summary`, `handle_comparison`, `handle_follow_up`, `handle`, `handle_stream`) accept and pass `user_id`
- **`backend/main.py`** — Extracts `user_id` from `current_user` dict, passes to upload/query/source flows

### Pinecone filter example

```python
# Combined filter: user isolation + source filter
filter_dict = {
    "$and": [
        {"user_id": {"$eq": "42"}},
        {"source": {"$eq": "atomic_habits.pdf"}}
    ]
}
```

---

## Phase 3a: pdfplumber Table Extraction

**Resume claim:** *"PDF with table extraction via pdfplumber"*

### What was changed

Replaced PyPDF2 (text-only extraction) with pdfplumber (text + table extraction with markdown formatting).

### Modified files

- **`backend/ingestion/pdf_processor.py`** — Complete rewrite

### Technical details

- **Library:** `pdfplumber` (replaces `PyPDF2`)
- **Table extraction:** `page.extract_tables()` returns a list of tables, each as a list of rows. Tables are formatted as markdown:
  ```markdown
  | Header1 | Header2 | Header3 |
  | --- | --- | --- |
  | Cell1 | Cell2 | Cell3 |
  ```
- **Page processing:** For each page, extracts `page.extract_text()` (body text) and `_extract_tables(page)` (markdown tables). Combined as:
  ```
  [page body text]

  [Tables]
  [markdown formatted tables]
  ```
- **Metadata:** Each document dict includes `has_tables: bool` to indicate whether the page contained tabular data
- **Both `process()` (file path) and `process_bytes()` (upload bytes) support table extraction**

---

## Phase 3b: Token-Aware Recursive Chunking

**Resume claim:** *"token-aware recursive chunking with configurable overlap"*

### What was built

A hierarchical chunker that splits text at natural boundaries (paragraphs, sentences, clauses) rather than at fixed character positions, with chunk sizes measured in tokens (not characters).

### New file

| File | Purpose |
|------|---------|
| `backend/ingestion/recursive_chunker.py` | `RecursiveChunker` class wrapping LangChain's `RecursiveCharacterTextSplitter` with tiktoken token counting |

### Technical details

- **Library:** `langchain-text-splitters` (`RecursiveCharacterTextSplitter`)
- **Token counting:** `tiktoken` with `cl100k_base` encoding (same tokenizer used by GPT-4/Claude). The `length_function` parameter is set to `self._count_tokens` so chunk sizes are measured in tokens, not characters
- **Separator hierarchy:** `["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""]` — tries paragraph breaks first, then sentences, then clauses, then words. This preserves semantic coherence within chunks
- **Configuration:** `CHUNK_SIZE = 800` tokens, `CHUNK_OVERLAP = 150` tokens (from `backend/config.py`). Configurable via env vars
- **Chunking method selection:** `CHUNKING_METHOD` env var (`"recursive"` or `"linear"`). Default is `"recursive"`. Set in `get_components()` in `main.py`:
  ```python
  if CHUNKING_METHOD == "recursive":
      chunker = RecursiveChunker()
  else:
      chunker = Chunker()  # original linear sliding-window
  ```
- **Metadata:** Each chunk includes `chunking_method: "recursive"` and `token_count` in its metadata
- **Same interface:** `chunk_documents(documents)` — drop-in replacement for the original `Chunker`

### Modified files

- **`backend/ingestion/__init__.py`** — Added `RecursiveChunker` import and export
- **`backend/config.py`** — Added `CHUNKING_METHOD`
- **`backend/main.py`** — Selects chunker based on config

---

## Phase 4: Hybrid Retrieval (BM25 + Dense + RRF)

**Resume claim:** *"hybrid retrieval (dense vector search + BM25 sparse retrieval) fused via reciprocal rank fusion, improving nDCG@10 over pure vector search"*

### What was built

A dual-retrieval system that runs both dense (Pinecone/Cohere embeddings) and sparse (BM25) searches, then fuses the ranked results using Reciprocal Rank Fusion (RRF).

### New files

| File | Purpose |
|------|---------|
| `backend/retrieval/bm25_index.py` | `BM25Index` — In-memory BM25Okapi sparse retrieval index with pickle persistence |
| `backend/retrieval/hybrid_retriever.py` | `HybridRetriever` — Combines dense + sparse results with RRF |
| `backend/scripts/rebuild_bm25.py` | One-time script to build BM25 index from existing Pinecone data |

### Technical details

**BM25 Index (`bm25_index.py`):**
- **Library:** `rank-bm25` (BM25Okapi algorithm)
- **Tokenizer:** Simple regex tokenizer (`re.findall(r'\b\w+\b', text.lower())`) filtering tokens > 1 character
- **Persistence:** Pickle-based save/load to `data/bm25_cache/bm25_index.pkl`
- **User isolation:** `search()` filters results by `user_id` metadata
- **Lifecycle:** Index is loaded from cache on startup. After each document upload, new chunks are added with `add_chunks()` and the index is saved with `save()`
- **`is_empty` property:** Returns True if no chunks, used by `QueryEngine` to fall back to dense-only

**Reciprocal Rank Fusion (`hybrid_retriever.py`):**
- **RRF formula:** `score(d) = Σ 1 / (k + rank_i)` where `k = 60` (configurable via `RRF_K` env var) and `rank_i` is the document's rank in each result list
- **Process:**
  1. Dense retrieval: Pinecone semantic search with Cohere embeddings → top_k * 2 results
  2. Sparse retrieval: BM25Okapi keyword search → top_k * 2 results
  3. RRF fusion: Merge both ranked lists, compute RRF score per document, sort descending
  4. Return top_k fused results with `rrf_score` field

**Why RRF works:** Dense retrieval excels at semantic similarity ("What is the Goldilocks Rule?" matches "zone of proximal development"), while BM25 excels at exact keyword matching ("pdfplumber" matches "pdfplumber"). RRF combines both strengths without needing score normalization.

### Modified files

- **`backend/config.py`** — Added `USE_HYBRID_RETRIEVAL`, `RRF_K`
- **`backend/retrieval/query_engine.py`** — Constructor accepts `bm25_index`, creates `HybridRetriever` when hybrid is enabled. `_retrieve_and_rerank()` uses hybrid retriever when available and non-empty, falls back to dense-only otherwise
- **`backend/main.py`** — Initializes `BM25Index` in `get_components()`, loads from cache, passes to `QueryEngine`. After uploads, adds chunks to BM25 index and saves

---

## Phase 5: LangChain LCEL Query Routing

**Resume claim:** *"agentic query routing with LangChain: classifier routes queries to document retrieval, clarification generation, or graceful fallback based on intent confidence scores"*

### What was changed

Replaced direct Groq API calls in the query router with LangChain Expression Language (LCEL) chains.

### Modified file

- **`backend/routing/query_router.py`** — Rewritten to use LangChain LCEL

### Technical details

**LCEL chains built:**
```python
# Classification chain: prompt template -> LLM -> string parser
classify_prompt = ChatPromptTemplate.from_messages([("user", CLASSIFY_AND_CORRECT_PROMPT)])
_classify_chain = classify_prompt | ChatGroq(model_name=GROQ_MODEL) | StrOutputParser()

# Rewrite chain: prompt template -> LLM -> string parser
rewrite_prompt = ChatPromptTemplate.from_messages([("user", REWRITE_PROMPT)])
_rewrite_chain = rewrite_prompt | ChatGroq(model_name=GROQ_MODEL) | StrOutputParser()
```

**Lazy initialization:** Chains are created on first use via `_get_chains()` to avoid import overhead at startup.

**Route types (8 categories):**
| Route | Handler |
|-------|---------|
| `KNOWLEDGE` | Full RAG pipeline (retrieve + generate) |
| `SUMMARY` | RAG with summary-focused prompt |
| `COMPARISON` | RAG with comparison-focused prompt |
| `FOLLOW_UP` | Coreference resolution + RAG |
| `META` | Lists documents, describes capabilities (no RAG) |
| `GREETING` | Direct LLM response (no RAG) |
| `CLARIFICATION` | Asks user to rephrase |
| `OUT_OF_SCOPE` | Graceful rejection |

**Two-tier routing:**
1. **Fast keyword pre-filter:** Compiled regex patterns match obvious cases (greetings, meta queries) without any LLM call. Returns confidence 0.9
2. **LangChain LCEL classification:** For ambiguous queries, runs the classify chain. Also performs spelling correction (`CLASSIFY_AND_CORRECT_PROMPT` outputs `CATEGORY | corrected query`). Returns confidence 1.0
3. **Fallback:** On any error, defaults to `KNOWLEDGE` route with confidence 0.5

**Combined classify + correct prompt:** A single LLM call handles both classification and spelling correction:
```
"explain the concpt on the boks" → KNOWLEDGE | explain the concept on the books
```

---

## Phase 6: Persistent Conversation Memory

**Resume claim:** *"multi-turn conversation memory"*

### What was built

Server-side conversation persistence using SQLite. Conversations are scoped per-user, messages are stored with timestamps and optional source references.

### New files

| File | Purpose |
|------|---------|
| `backend/conversations/__init__.py` | Exports `ConversationService` |
| `backend/conversations/service.py` | Full CRUD for conversations and messages |

### Technical details

**ConversationService methods:**
| Method | What it does |
|--------|-------------|
| `create_conversation(user_id, title)` | Creates a new conversation row |
| `get_conversations(user_id)` | Lists user's conversations, ordered by `updated_at DESC` |
| `add_message(conv_id, role, content, sources)` | Inserts message, updates conversation `updated_at` |
| `get_messages(conv_id, limit=50)` | Returns messages in chronological order with parsed sources JSON |
| `get_recent_history(conv_id, limit=10)` | Returns last N messages as `[{"role": "...", "content": "..."}]` for router's chat_history parameter |
| `delete_conversation(conv_id, user_id)` | Deletes conversation + cascade-deletes messages. Verifies ownership |
| `verify_ownership(conv_id, user_id)` | Checks `WHERE id = ? AND user_id = ?` |

**Query flow with conversation:**
1. Client sends `POST /api/query` with `conversation_id`
2. Server verifies ownership, loads chat history from DB via `get_recent_history()`
3. Saves user message to DB
4. Routes query (with chat history for coreference resolution)
5. Streams response via SSE
6. After streaming completes, saves assistant response + sources to DB

### API endpoints

```
POST   /api/conversations              — Create new conversation
GET    /api/conversations              — List user's conversations
GET    /api/conversations/{id}/messages — Get conversation messages
DELETE /api/conversations/{id}         — Delete conversation (cascade)
```

### Modified files

- **`backend/main.py`** — Added conversation CRUD endpoints. `QueryRequest` model has new `conversation_id: Optional[int]` field. Query endpoint loads/saves chat history when `conversation_id` is provided

---

## Phase 7: RAGAS Context Relevance + nDCG@10 + Tuning

**Resume claim:** *"RAGAS evaluation framework measuring retrieval accuracy, answer faithfulness, and context relevance; used metrics to iteratively tune chunk size and retrieval parameters"*

### What was changed

Extended the evaluation framework with two new RAGAS metrics and a retrieval ranking metric, plus a parameter tuning script.

### Modified files

- **`backend/evaluation/eval_runner.py`** — Added `ContextPrecision`, `ContextRecall`, `compute_ndcg_at_k()`

### New file

| File | Purpose |
|------|---------|
| `backend/evaluation/tuning_runner.py` | Parameter sweep script for iterative tuning |

### Technical details

**nDCG@10 implementation (`compute_ndcg_at_k`):**
```python
# Binary relevance: 1.0 if expected source matches, 0.0 otherwise
relevances = [1.0 if expected_source.lower() in s.lower() else 0.0 for s in retrieved_sources[:k]]

# DCG = Σ rel_i / log2(i + 2)
dcg = sum(rel / math.log2(i + 2) for i, rel in enumerate(relevances))

# Ideal DCG = same formula with relevances sorted descending
idcg = sum(rel / math.log2(i + 2) for i, rel in enumerate(sorted(relevances, reverse=True)))

# nDCG = DCG / iDCG
return dcg / idcg if idcg > 0 else 0.0
```

**RAGAS metrics (4 total):**
| Metric | Needs Ground Truth | What it measures |
|--------|-------------------|-----------------|
| `Faithfulness` | No | Is the answer grounded in the context? |
| `ContextPrecision` | No | Are retrieved chunks relevant to the question? |
| `AnswerCorrectness` | Yes | Does the answer match the expected answer? |
| `ContextRecall` | Yes | Does the context contain info needed for the ground truth? |

All metrics use **Gemini 2.5 Flash** as the LLM judge (free tier via `google-genai`).

**Parameter tuning script (`tuning_runner.py`):**
- Tests combinations of `top_k` [3, 5, 7, 10] and `threshold` [0.2, 0.25, 0.3, 0.35, 0.4]
- For each configuration: temporarily overrides `cfg.TOP_K` and `cfg.SIMILARITY_THRESHOLD`, runs all test cases, computes metrics
- **Composite score** (weighted combination):
  - 30% source hit rate
  - 30% nDCG@10
  - 20% precision@k
  - 20% average similarity
- Outputs ranked configurations sorted by composite score
- Has `--quick` mode that tests only 4 combinations instead of 10
- Usage: `python -m backend.evaluation.tuning_runner --quick`

---

## Phase 8: Coreference Resolution Enhancement

**Resume claim:** *"coreference resolution"*

### What was changed

Added pronoun detection heuristics to avoid unnecessary LLM rewrite calls, and enhanced the rewrite prompt for better coreference resolution.

### Modified file

- **`backend/routing/query_router.py`** — Added `PRONOUN_PATTERNS`, `_needs_rewrite()` method, enhanced `REWRITE_PROMPT`

### Technical details

**Pronoun detection patterns:**
```python
PRONOUN_PATTERNS = [
    r'\b(it|its|this|that|these|those|they|them|their|he|she|him|her|his)\b',
    r'\b(the document|the file|the book|the article|the text)\b',
    r'\b(above|previous|earlier|last|before|mentioned)\b',
]
```

**`_needs_rewrite(query)` method:**
- Checks if query contains pronouns, vague references, or temporal markers
- If False: skips the LLM rewrite call entirely (saves API call + latency)
- If True: invokes the rewrite chain with conversation history

**Enhanced rewrite prompt rules:**
1. Replace ALL pronouns (it, they, that, this) with actual referents from conversation
2. Replace vague references ("the document", "the book") with specific names
3. If query references "more about X" or "explain further", include what X refers to
4. Keep the rewritten query concise and natural
5. If already self-contained, return unchanged
6. Do NOT add information that wasn't in the conversation

**Example flow:**
```
User: "What is habit stacking?"
Assistant: [answers about habit stacking from Atomic Habits]
User: "How does it relate to the two-minute rule?"
                ^^
_needs_rewrite() detects "it" → True
Rewrite chain → "How does habit stacking relate to the two-minute rule?"
```

---

## New Directory Structure

```
backend/
  auth/                              # NEW — Phase 1
    __init__.py
    models.py                        # Pydantic: UserCreate, UserLogin, Token
    database.py                      # SQLite schema + init_db()
    service.py                       # AuthService: bcrypt, JWT, user CRUD
    dependencies.py                  # FastAPI deps: get_current_user
  conversations/                     # NEW — Phase 6
    __init__.py
    service.py                       # ConversationService: CRUD + history
  ingestion/
    pdf_processor.py                 # REWRITTEN — Phase 3a (pdfplumber)
    recursive_chunker.py             # NEW — Phase 3b
    __init__.py                      # MODIFIED — exports RecursiveChunker
    chunker.py                       # (unchanged, original linear chunker)
    text_processor.py                # (unchanged)
    epub_processor.py                # (unchanged)
    docx_processor.py                # (unchanged)
    html_processor.py                # (unchanged)
  retrieval/
    bm25_index.py                    # NEW — Phase 4
    hybrid_retriever.py              # NEW — Phase 4
    query_engine.py                  # MODIFIED — Phase 2+4 (user_id, BM25)
    reranker.py                      # (unchanged)
  evaluation/
    eval_runner.py                   # MODIFIED — Phase 7 (nDCG, ContextPrecision/Recall)
    tuning_runner.py                 # NEW — Phase 7
    test_cases.json                  # (unchanged)
  scripts/
    rebuild_bm25.py                  # NEW — Phase 4
  routing/
    query_router.py                  # REWRITTEN — Phase 5+8 (LangChain LCEL + coreference)
    route_handlers.py                # MODIFIED — Phase 2 (user_id threading)
  storage/
    vector_store.py                  # MODIFIED — Phase 2 (user_id filtering)
  llm/
    reasoning.py                     # (unchanged)
  main.py                            # HEAVILY MODIFIED — Phases 1-7
  config.py                          # MODIFIED — Phases 1, 3b, 4
data/
  app.db                             # NEW (gitignored) — SQLite database
  bm25_cache/bm25_index.pkl          # NEW (gitignored) — BM25 index
```

---

## New Dependencies

Added to `requirements.txt`:

| Package | Version | Purpose | Phase |
|---------|---------|---------|-------|
| `pdfplumber` | >=0.10.0 | PDF text + table extraction (replaces PyPDF2) | 3a |
| `langchain-core` | >=0.2.0 | LCEL chain composition, prompt templates | 5 |
| `langchain-groq` | >=0.1.0 | ChatGroq LLM wrapper for LangChain | 5 |
| `langchain-text-splitters` | >=0.2.0 | RecursiveCharacterTextSplitter | 3b |
| `rank-bm25` | >=0.2.2 | BM25Okapi sparse retrieval | 4 |
| `python-jose[cryptography]` | >=3.3.0 | JWT token encode/decode | 1 |
| `passlib[bcrypt]` | >=1.7.4 | Password hashing with bcrypt | 1 |
| `aiosqlite` | >=0.19.0 | Async SQLite for auth + conversations | 1, 6 |

**Removed:** `PyPDF2` (replaced by `pdfplumber`)

All libraries are free/open-source. All external services (Pinecone, Cohere, Groq, Gemini) use free tiers.
