"""
MCP Server for the Personal Knowledge Base.

Exposes the KB to any MCP-compatible AI client (Claude Desktop, Cursor, etc.).

Tools:
  - search_knowledge_base: Semantic search across all stored content
  - get_article: Retrieve a specific article by slug
  - list_articles: List all articles (optionally filtered by project)
  - ask_knowledge_base: Full RAG question-answering
  - start_research: Launch deep research on a topic

Resources:
  - pkb://stats: KB statistics (article count, chunk count, etc.)

Prompts:
  - summarize_article: Summarize a specific article
  - compare_articles: Compare two articles

Usage:
  stdio:  python -m backend.mcp_server
  HTTP:   Mounted at /mcp on the FastAPI app (see main.py)
"""

import asyncio
import json
import logging
import os
from typing import Optional

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

# User ID for data isolation (stdio mode uses env var, HTTP can override)
MCP_USER_ID = os.getenv("MCP_USER_ID", "1")

mcp = FastMCP(
    "Personal Knowledge Base",
    instructions=(
        "This server provides access to a personal knowledge base. "
        "You can search stored articles, ask questions answered by RAG, "
        "list and retrieve articles, and launch deep research on any topic."
    ),
)


# ---------------------------------------------------------------------------
# Lazy component loading (same pattern as routes)
# ---------------------------------------------------------------------------

def _get_components():
    """Import get_components at call time to avoid circular imports."""
    from backend.main import get_components
    return get_components()


def _resolve_user_id(user_id: Optional[str] = None) -> str:
    """Use provided user_id or fall back to MCP_USER_ID env var."""
    return user_id or MCP_USER_ID


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def search_knowledge_base(
    query: str,
    top_k: int = 5,
    source_filter: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    """
    Search the knowledge base using semantic + BM25 hybrid retrieval.

    Args:
        query: The search query
        top_k: Number of results to return (default 5)
        source_filter: Optional filter by source name
        user_id: Optional user ID for data isolation
    """
    uid = _resolve_user_id(user_id)
    components = _get_components()
    qe = components["query_engine"]

    chunks, reranked = qe.retrieve(
        question=query,
        top_k=top_k,
        source_filter=source_filter,
        user_id=uid,
    )

    if not chunks:
        return "No results found for your query."

    results = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata", {})
        results.append(
            f"[{i}] (score: {chunk.get('score', 0):.3f}) "
            f"Source: {meta.get('source', 'unknown')}\n"
            f"{chunk.get('text', '')[:1000]}"
        )

    header = f"Found {len(chunks)} results"
    if reranked:
        header += " (reranked)"
    return f"{header}:\n\n" + "\n\n---\n\n".join(results)


@mcp.tool()
async def get_article(
    slug: str,
    user_id: Optional[str] = None,
) -> str:
    """
    Retrieve a specific article by its slug.

    Args:
        slug: The article's URL slug
        user_id: Optional user ID for data isolation
    """
    from backend.articles import database as articles_db

    uid = _resolve_user_id(user_id)
    article = await articles_db.get_article_by_slug(slug, user_id=int(uid))

    if not article:
        return f"Article with slug '{slug}' not found."

    tags = ", ".join(article["tags"]) if article["tags"] else "none"
    return (
        f"# {article['title']}\n\n"
        f"**Slug:** {article['slug']}\n"
        f"**Source:** {article['source']}\n"
        f"**Tags:** {tags}\n"
        f"**Created:** {article['created_at']}\n"
        f"**Chunks:** {article['chunks_count']}\n\n"
        f"---\n\n"
        f"{article['content_markdown']}"
    )


@mcp.tool()
async def list_articles(
    project_slug: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    """
    List all articles in the knowledge base.

    Args:
        project_slug: Optional project slug to filter by
        user_id: Optional user ID for data isolation
    """
    from backend.articles import database as articles_db

    uid = _resolve_user_id(user_id)

    if project_slug:
        from backend.projects import database as projects_db
        project_id = await projects_db.get_project_id_by_slug(project_slug, int(uid))
        if project_id is None:
            return f"Project '{project_slug}' not found."
        articles = await articles_db.get_articles_by_project(project_id)
    else:
        articles = await articles_db.get_all_articles(user_id=int(uid))

    if not articles:
        return "No articles found."

    lines = [f"Found {len(articles)} articles:\n"]
    for a in articles:
        tags = ", ".join(a["tags"][:3]) if a["tags"] else ""
        lines.append(
            f"- **{a['title']}** (slug: `{a['slug']}`, source: {a['source']}"
            f"{', tags: ' + tags if tags else ''}, {a['created_at'][:10]})"
        )

    return "\n".join(lines)


@mcp.tool()
async def ask_knowledge_base(
    question: str,
    source_filter: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    """
    Ask a question and get an answer from the RAG pipeline (retrieval + LLM).

    Args:
        question: The question to answer
        source_filter: Optional filter by source name
        user_id: Optional user ID for data isolation
    """
    uid = _resolve_user_id(user_id)
    components = _get_components()
    qe = components["query_engine"]

    result = await qe.query(
        question=question,
        source_filter=source_filter,
        user_id=uid,
    )

    sources = result.get("sources", [])
    source_list = "\n".join(
        f"- {s.get('source', 'unknown')}" for s in sources
    ) if sources else "No sources cited."

    return (
        f"{result['answer']}\n\n"
        f"**Sources:**\n{source_list}\n\n"
        f"*Provider: {result.get('provider', 'unknown')}, "
        f"Chunks used: {result.get('chunks_used', 0)}*"
    )


@mcp.tool()
async def start_research(
    topic: str,
    user_id: Optional[str] = None,
) -> str:
    """
    Launch a deep research session on any topic. Produces a comprehensive,
    long-form article stored in the knowledge base.

    This may take 2-5 minutes depending on topic complexity.

    Args:
        topic: The research topic (e.g. "transformer architecture in deep learning")
        user_id: Optional user ID for data isolation
    """
    uid = _resolve_user_id(user_id)

    from backend.research.agent import run_research_pipeline
    from backend.articles import database as articles_db
    from backend.articles.structurer import structure_to_html

    # Get query engine for PKB search (knowledge flywheel)
    components = _get_components()
    qe = components.get("query_engine")

    # Run the sync pipeline in a thread
    # MCP mode: use env vars for API keys (no HTTP headers available)
    result = await asyncio.to_thread(
        run_research_pipeline,
        topic=topic,
        tavily_api_key=os.getenv("TAVILY_API_KEY", ""),
        progress_callback=lambda phase, step, total, msg: logger.info(
            "Research [%s] %d/%d: %s", phase, step, total, msg
        ),
        query_engine=qe,
        user_id=uid,
    )
    doc_meta = {
        "text": result["content_markdown"],
        "source": result["title"],
        "source_type": "article",
        "article_slug": result["slug"],
    }
    chunks = components["chunker"].chunk_documents([doc_meta])
    doc_ids = components["vector_store"].add_documents(chunks, user_id=uid)

    # Update BM25
    bm25 = components.get("bm25_index")
    if bm25 is not None:
        bm25_items = []
        for chunk, doc_id in zip(chunks, doc_ids):
            bm25_items.append({
                "text": chunk["text"],
                "id": doc_id,
                "metadata": {
                    "source": chunk.get("source", "unknown"),
                    "source_type": "article",
                    "user_id": uid,
                },
            })
        bm25.add_chunks(bm25_items)
        bm25.save()

    # Generate HTML
    content_html = await asyncio.to_thread(
        structure_to_html,
        result["content_markdown"],
        result["title"],
        None,  # groq_api_key
    )

    # Save to SQLite
    await articles_db.insert_article(
        slug=result["slug"],
        title=result["title"],
        tags=result["tags"],
        source="research",
        content_markdown=result["content_markdown"],
        user_id=int(uid),
        chunks_count=len(chunks),
        conversation_length=0,
        content_html=content_html,
    )

    return (
        f"Research complete!\n\n"
        f"**Title:** {result['title']}\n"
        f"**Slug:** {result['slug']}\n"
        f"**Word count:** {result['word_count']:,}\n"
        f"**Sources found:** {result['sources_count']}\n"
        f"**Sections:** {result['sections_count']}\n"
        f"**Tags:** {', '.join(result['tags'])}\n\n"
        f"The article has been stored in your knowledge base and is searchable."
    )


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------

@mcp.resource("pkb://stats")
async def get_stats() -> str:
    """Knowledge base statistics: article count, chunk count, source count."""
    from backend.articles import database as articles_db

    components = _get_components()
    sources = components["vector_store"].get_all_sources()
    total_chunks = components["vector_store"].count()
    articles = await articles_db.get_all_articles()

    return json.dumps({
        "total_articles": len(articles),
        "total_chunks": total_chunks,
        "total_sources": len(sources),
        "sources": [
            {"name": s["source"], "type": s["source_type"], "chunks": s["chunk_count"]}
            for s in sources
        ],
    }, indent=2)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

@mcp.prompt()
async def summarize_article(slug: str) -> str:
    """Generate a prompt to summarize a specific article from the knowledge base."""
    from backend.articles import database as articles_db

    article = await articles_db.get_article_by_slug(slug)
    if not article:
        return f"Article with slug '{slug}' not found."

    return (
        f"Please read the following article and provide a comprehensive summary "
        f"with key takeaways:\n\n"
        f"# {article['title']}\n\n"
        f"{article['content_markdown'][:15000]}"
    )


@mcp.prompt()
async def compare_articles(slug1: str, slug2: str) -> str:
    """Generate a prompt to compare two articles from the knowledge base."""
    from backend.articles import database as articles_db

    article1 = await articles_db.get_article_by_slug(slug1)
    article2 = await articles_db.get_article_by_slug(slug2)

    if not article1:
        return f"Article with slug '{slug1}' not found."
    if not article2:
        return f"Article with slug '{slug2}' not found."

    return (
        f"Please compare and contrast the following two articles. "
        f"Identify common themes, differences in perspective, and key insights.\n\n"
        f"## Article 1: {article1['title']}\n\n"
        f"{article1['content_markdown'][:8000]}\n\n"
        f"---\n\n"
        f"## Article 2: {article2['title']}\n\n"
        f"{article2['content_markdown'][:8000]}"
    )


# ---------------------------------------------------------------------------
# Entry point (stdio transport for Claude Desktop / CLI)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="stdio")
