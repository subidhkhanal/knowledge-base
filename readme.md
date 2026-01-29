## Personal Knowledge Base (PKB) - Project Guideline

---

### What It Does

A personal RAG system that answers questions ONLY from your uploaded content (books, audiobooks, notes). No external data. Uses strong reasoning LLM (Claude/GPT-4) for answers which are completely free and donot need to pay at all.

---

### Problem It Solves

"I have books, audiobooks, and notes scattered everywhere. I want one system to query all my knowledge with AI-level reasoning, without hitting storage limits of existing tools."

---

### Core Features

| Feature | Description |
|---|---|
| PDF Upload | Extract text from PDF books/documents |
| Audio Upload | Transcribe audiobooks/voice notes using Whisper |
| Text/Notes Upload | Direct paste or .txt/.md files |
| Vector Storage | Store all content in local ChromaDB (unlimited) |
| Query System | Ask questions, retrieve relevant chunks |
| LLM Reasoning | Send chunks to Claude API for final answer |
| Citation | Show which book/page/source the answer came from |
| Simple UI | Using Next.js |

---

### Tech Stack

```
- Python 3.10+
- LangChain (orchestration)
- ChromaDB (vector database, local)
- (audio transcription)
- PyPDF2 or pdfplumber (PDF extraction)
- (reasoning)
- Next.js (UI)
- sentence-transformers (embeddings)
```

---

### Architecture

```
Input Sources (PDF, Audio, Notes)
        ↓
Preprocessing
    - PDF → PyPDF2 → raw text
    - Audio → Whisper → raw text  
    - Notes → direct text
        ↓
Chunking (500-1000 tokens per chunk with overlap)
        ↓
Embedding (sentence-transformers or OpenAI embeddings)
        ↓
Store in ChromaDB (with metadata: source, page, timestamp)
        ↓
User Query
        ↓
Embed query → Similarity search → Top K relevant chunks
        ↓
Prompt = System instruction + Retrieved chunks + User question
        ↓
LLM API → Answer with citations
        ↓
Display in Next.js
```

---

### MVP Scope (5-7 days)

| Day | Task |
|---|---|
| 1 | Setup + PDF ingestion + chunking |
| 2 | ChromaDB storage + basic retrieval |
| 3 | LLM integration + prompt engineering |
| 4 | Audio transcription |
| 5 | Next.js (upload + chat) |
| 6 | Citations + source tracking |
| 7 | Polish + README + deploy |

---

### Key Implementation Details

**Chunking:**
- Chunk size: 500-1000 tokens
- Overlap: 100-200 tokens
- Preserve metadata (filename, page number)

**Retrieval:**
- Top K = 5-10 chunks
- Similarity threshold to filter irrelevant

**Prompt Template:**
```
You are an assistant that answers ONLY from the provided context.
If the answer is not in the context, say "I don't have this information in my knowledge base."

Context:
{retrieved_chunks}

Question: {user_query}

Answer with citation [Source: filename, page X]:
```

**Audio Handling:**
- Use Whisper (local or API)
- Chunk long audio into segments
- Store transcription with timestamp metadata

---
