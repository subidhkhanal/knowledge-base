# Personal Knowledge Base (PKB)

A personal RAG system that answers questions ONLY from your uploaded content (books, notes, documents). No external data - just your knowledge.

## Features

- **PDF Upload** - Extract and index text from PDF documents
- **Text/Notes Upload** - Add plain text or markdown notes
- **Smart Search** - Vector similarity search to find relevant content
- **AI Answers** - Get answers powered by Groq's free LLM API
- **Citations** - See exactly which source and page the answer came from

## Tech Stack

- **Backend**: Python, FastAPI, ChromaDB
- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **LLM**: Groq API (free tier - Llama 3.1)
- **Embeddings**: ChromaDB default (lightweight)

## Live Demo

- **Frontend**: https://personal-assistant-indol-omega.vercel.app
- **Backend API**: https://pkb-backend.onrender.com

## Local Development

### Prerequisites

- Python 3.10+
- Node.js 18+
- Groq API key (free at https://console.groq.com)

### Backend Setup

```bash
# Clone the repository
git clone https://github.com/ashishgautam0/personal-assistant.git
cd personal-assistant

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo "GROQ_API_KEY=your_groq_api_key_here" > .env
echo "GROQ_MODEL=llama-3.1-8b-instant" >> .env

# Run the backend
uvicorn backend.main:app --reload --port 8000
```

### Frontend Setup

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Create .env.local file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Run the frontend
npm run dev
```

Open http://localhost:3000 in your browser.

## Deployment

### Backend (Render)

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your repository
4. Set environment variables:
   - `GROQ_API_KEY` = your Groq API key
   - `GROQ_MODEL` = llama-3.1-8b-instant
5. Deploy

### Frontend (Vercel)

1. Import project from GitHub
2. Set environment variable:
   - `NEXT_PUBLIC_API_URL` = your Render backend URL
3. Deploy

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/stats` | GET | Get knowledge base stats |
| `/api/upload/pdf` | POST | Upload PDF file |
| `/api/upload/text` | POST | Upload text content |
| `/api/query` | POST | Ask a question |
| `/api/sources` | GET | List all sources |
| `/api/sources/{name}` | DELETE | Delete a source |

## Usage

1. **Upload Content**: Go to Upload page, add PDFs or text notes
2. **Ask Questions**: Go to Chat, ask questions about your content
3. **View Sources**: Check Sources page to manage uploaded content

## License

MIT
