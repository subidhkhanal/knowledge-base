"""Phase 2: Execute research plan via PKB search + Tavily web search.

The researcher first checks the existing knowledge base for relevant content,
then fills gaps with web research. This creates a knowledge flywheel — each
research article builds on everything previously stored.
"""

import logging
from typing import List, Dict, Optional, Callable, Any

from tavily import TavilyClient

from backend.config import TAVILY_API_KEY

logger = logging.getLogger(__name__)


def _get_tavily_client(tavily_api_key: Optional[str] = None) -> TavilyClient:
    key = tavily_api_key or TAVILY_API_KEY
    if not key:
        raise ValueError(
            "Tavily API key is required for web research. "
            "Add it in Settings or set TAVILY_API_KEY env var."
        )
    return TavilyClient(api_key=key)


def search_pkb(
    query: str,
    query_engine: Any,
    user_id: str,
    top_k: int = 5,
) -> List[dict]:
    """
    Search the existing knowledge base for relevant content.

    Uses the same hybrid retrieval (vector + BM25) as the chat interface.
    Returns a list of chunk dicts with text, source, score.
    """
    try:
        chunks, _ = query_engine.retrieve(
            question=query,
            top_k=top_k,
            user_id=user_id,
        )
        return chunks
    except Exception as e:
        logger.warning("PKB search failed for '%s': %s", query, e)
        return []


def _format_pkb_chunks(chunks: List[dict]) -> List[dict]:
    """Format PKB chunks into the same finding structure as web results."""
    results = []
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        results.append({
            "title": meta.get("source", "Your document"),
            "url": "pkb://local",
            "content": chunk.get("text", ""),
            "score": chunk.get("score", 0),
        })
    return results


def research_subtopic(
    tavily: TavilyClient,
    subtopic: dict,
    pkb_chunks: Optional[List[dict]] = None,
) -> dict:
    """
    Research a single subtopic by searching PKB first, then the web.

    Returns dict with heading, angle, findings (tagged with source origin),
    full_articles, and PKB/web source counts.
    """
    findings = []
    all_urls = []

    # --- Step 1: Include existing PKB knowledge ---
    pkb_sources = 0
    if pkb_chunks:
        pkb_results = _format_pkb_chunks(pkb_chunks)
        pkb_sources = len(pkb_results)
        findings.append({
            "query": f"[FROM YOUR KNOWLEDGE BASE] {subtopic['heading']}",
            "source_type": "pkb",
            "tavily_answer": "",
            "results": pkb_results,
        })

    # --- Step 2: Search the web for new information ---
    for query in subtopic.get("search_queries", []):
        try:
            result = tavily.search(
                query=query,
                search_depth="advanced",
                max_results=5,
                include_answer=True,
                include_raw_content=False,
            )

            search_results = []
            for r in result.get("results", []):
                search_results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                    "score": r.get("score", 0),
                })
                all_urls.append({
                    "url": r.get("url", ""),
                    "score": r.get("score", 0),
                })

            findings.append({
                "query": query,
                "source_type": "web",
                "tavily_answer": result.get("answer", ""),
                "results": search_results,
            })
        except Exception as e:
            logger.warning("Search failed for query '%s': %s", query, e)
            findings.append({
                "query": query,
                "source_type": "web",
                "error": str(e),
                "results": [],
            })

    # Fetch full content from top 2-3 URLs (highest scoring)
    top_urls = sorted(all_urls, key=lambda x: x["score"], reverse=True)[:3]
    full_articles = []

    for url_info in top_urls:
        try:
            extracted = tavily.extract(urls=[url_info["url"]])
            for item in extracted.get("results", []):
                full_articles.append({
                    "url": item.get("url", ""),
                    "full_content": item.get("raw_content", "")[:8000],
                })
        except Exception:
            pass  # Some URLs fail to extract, that's okay

    web_sources = sum(
        len(f.get("results", []))
        for f in findings
        if f.get("source_type") == "web"
    )

    return {
        "heading": subtopic["heading"],
        "angle": subtopic["angle"],
        "findings": findings,
        "full_articles": full_articles,
        "pkb_sources": pkb_sources,
        "web_sources": web_sources,
    }


def execute_research_plan(
    plan: dict,
    tavily_api_key: Optional[str] = None,
    query_engine: Any = None,
    user_id: Optional[str] = None,
    progress_callback: Optional[Callable] = None,
) -> List[dict]:
    """
    Execute the full research plan — search PKB first, then fill gaps with web.

    Args:
        plan: Output from create_research_plan()
        tavily_api_key: Optional user-provided Tavily API key
        query_engine: Optional QueryEngine for PKB search
        user_id: Optional user ID for PKB data isolation
        progress_callback: Optional callable(step, total, message)

    Returns:
        List of researched subtopics with all findings (PKB + web)
    """
    tavily = _get_tavily_client(tavily_api_key)
    research_bank = []
    total = len(plan["subtopics"])
    total_pkb_sources = 0

    # --- Step A: Search PKB for the broad topic ---
    pkb_by_subtopic: Dict[str, List[dict]] = {}
    if query_engine and user_id:
        if progress_callback:
            progress_callback(0, total, "Searching your knowledge base first...")

        # Search the broad topic
        broad_chunks = search_pkb(
            plan.get("title", ""), query_engine, user_id, top_k=10
        )
        if broad_chunks:
            logger.info(
                "Found %d existing chunks for broad topic '%s'",
                len(broad_chunks), plan.get("title", ""),
            )

        # Search each subtopic heading
        for subtopic in plan["subtopics"]:
            heading = subtopic["heading"]
            chunks = search_pkb(heading, query_engine, user_id, top_k=5)
            # Also include broad-topic chunks that are relevant
            all_chunks = chunks + [
                c for c in broad_chunks
                if c not in chunks  # Rough dedup by reference
            ]
            # Deduplicate by text content and limit
            seen_texts = set()
            unique_chunks = []
            for c in all_chunks:
                text_key = c.get("text", "")[:200]
                if text_key not in seen_texts:
                    seen_texts.add(text_key)
                    unique_chunks.append(c)
            pkb_by_subtopic[heading] = unique_chunks[:8]

        total_pkb_hits = sum(len(v) for v in pkb_by_subtopic.values())
        if total_pkb_hits > 0:
            logger.info(
                "PKB search found %d total chunks across %d subtopics",
                total_pkb_hits,
                sum(1 for v in pkb_by_subtopic.values() if v),
            )

    # --- Step B: Research each subtopic (PKB + Web) ---
    for i, subtopic in enumerate(plan["subtopics"]):
        if progress_callback:
            progress_callback(i + 1, total, f"Researching: {subtopic['heading']}")

        pkb_chunks = pkb_by_subtopic.get(subtopic["heading"], [])

        researched = research_subtopic(tavily, subtopic, pkb_chunks=pkb_chunks)
        research_bank.append(researched)

        total_pkb_sources += researched.get("pkb_sources", 0)
        web_count = researched.get("web_sources", 0)
        pkb_count = researched.get("pkb_sources", 0)

        logger.info(
            "Researched subtopic %d/%d: %s (PKB: %d, Web: %d)",
            i + 1, total, subtopic["heading"], pkb_count, web_count,
        )

    logger.info(
        "Research complete: %d subtopics, %d PKB sources, %d web sources",
        total,
        total_pkb_sources,
        sum(r.get("web_sources", 0) for r in research_bank),
    )

    return research_bank
