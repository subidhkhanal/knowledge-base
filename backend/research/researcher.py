"""Phase 2: Execute research plan via Tavily search + extract."""

import logging
from typing import List, Dict, Optional, Callable

from tavily import TavilyClient

from backend.config import TAVILY_API_KEY

logger = logging.getLogger(__name__)


def _get_tavily_client() -> TavilyClient:
    if not TAVILY_API_KEY:
        raise ValueError(
            "TAVILY_API_KEY is required. Get one at https://tavily.com"
        )
    return TavilyClient(api_key=TAVILY_API_KEY)


def research_subtopic(tavily: TavilyClient, subtopic: dict) -> dict:
    """
    Research a single subtopic by running its search queries.

    Returns dict with heading, angle, findings, full_articles.
    """
    findings = []
    all_urls = []

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
                "tavily_answer": result.get("answer", ""),
                "results": search_results,
            })
        except Exception as e:
            logger.warning("Search failed for query '%s': %s", query, e)
            findings.append({
                "query": query,
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

    return {
        "heading": subtopic["heading"],
        "angle": subtopic["angle"],
        "findings": findings,
        "full_articles": full_articles,
    }


def execute_research_plan(
    plan: dict,
    progress_callback: Optional[Callable] = None,
) -> List[dict]:
    """
    Execute the full research plan — research all subtopics.

    Args:
        plan: Output from create_research_plan()
        progress_callback: Optional callable(step, total, message)

    Returns:
        List of researched subtopics with all findings
    """
    tavily = _get_tavily_client()
    research_bank = []
    total = len(plan["subtopics"])

    for i, subtopic in enumerate(plan["subtopics"]):
        if progress_callback:
            progress_callback(i + 1, total, f"Researching: {subtopic['heading']}")

        researched = research_subtopic(tavily, subtopic)
        research_bank.append(researched)

        result_count = sum(
            len(f.get("results", [])) for f in researched["findings"]
        )
        logger.info(
            "Researched subtopic %d/%d: %s (%d results)",
            i + 1, total, subtopic["heading"], result_count,
        )

    return research_bank
