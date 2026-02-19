"""Research agent orchestrator — single entry point for the full pipeline."""

import re
import time
import logging
from typing import Optional, Callable, Any, Dict

from backend.research.planner import create_research_plan
from backend.research.researcher import execute_research_plan
from backend.research.analyzer import analyze_research
from backend.research.writer import write_article

logger = logging.getLogger(__name__)


def generate_research_slug(title: str) -> str:
    """Generate a URL-friendly slug with timestamp suffix (matches publisher.py pattern)."""
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:70]
    suffix = hex(int(time.time()))[2:]
    return f"{base}-{suffix}"


def extract_tags(plan: dict, topic: str) -> list:
    """Extract relevant tags from the research plan."""
    words = topic.lower().split()
    for st in plan.get("subtopics", [])[:5]:
        words.extend(st.get("heading", "").lower().split()[:2])

    stop_words = {
        "the", "a", "an", "of", "in", "to", "and", "is", "for",
        "on", "with", "how", "why", "what", "this", "that", "are",
    }
    tags = [w for w in set(words) if w not in stop_words and len(w) > 2]
    return tags[:10]


def run_research_pipeline(
    topic: str,
    groq_api_key: Optional[str] = None,
    tavily_api_key: Optional[str] = None,
    progress_callback: Optional[Callable] = None,
    query_engine: Any = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full research pipeline: topic -> plan -> PKB + web research -> analysis -> article.

    The pipeline first searches your existing knowledge base, then fills gaps
    with web research. This creates a knowledge flywheel where each article
    builds on everything previously stored.

    Args:
        topic: The research topic
        groq_api_key: Optional user-provided Groq key
        tavily_api_key: Optional user-provided Tavily key
        progress_callback: Optional callable(phase, step, total, message)
        query_engine: Optional QueryEngine for PKB search (knowledge flywheel)
        user_id: Optional user ID for PKB data isolation

    Returns:
        dict with title, subtitle, slug, content_markdown, tags, word_count, etc.
    """
    total_phases = 4

    # --- Phase 1: Plan ---
    if progress_callback:
        progress_callback("planning", 1, total_phases, "Planning research angles...")

    plan = create_research_plan(topic, groq_api_key=groq_api_key)

    if progress_callback:
        progress_callback(
            "planning_done", 1, total_phases,
            f"Plan ready: {len(plan['subtopics'])} angles, "
            f"{len(plan['outline'])} sections",
        )

    # --- Phase 2: Research (PKB first, then web) ---
    if query_engine and user_id:
        if progress_callback:
            progress_callback(
                "researching", 2, total_phases,
                "Searching your knowledge base, then the web...",
            )
    else:
        if progress_callback:
            progress_callback(
                "researching", 2, total_phases, "Researching across the web..."
            )

    def research_progress(step, total, msg):
        if progress_callback:
            progress_callback(
                "researching", 2, total_phases,
                f"Researching ({step}/{total}): {msg}",
            )

    research_bank = execute_research_plan(
        plan,
        tavily_api_key=tavily_api_key,
        query_engine=query_engine,
        user_id=user_id,
        progress_callback=research_progress,
    )

    # --- Phase 3: Analyze ---
    if progress_callback:
        progress_callback(
            "analyzing", 3, total_phases,
            "Analyzing findings and creating writing briefs...",
        )

    analysis = analyze_research(plan, research_bank, groq_api_key=groq_api_key)

    # --- Phase 4: Write ---
    if progress_callback:
        progress_callback("writing", 4, total_phases, "Writing article...")

    def writing_progress(step, total, msg):
        if progress_callback:
            progress_callback(
                "writing", 4, total_phases,
                f"Writing ({step}/{total}): {msg}",
            )

    article_markdown = write_article(
        plan, analysis, research_bank,
        groq_api_key=groq_api_key,
        progress_callback=writing_progress,
    )

    # Compile result
    word_count = len(article_markdown.split())
    pkb_sources = sum(r.get("pkb_sources", 0) for r in research_bank)
    web_sources = sum(r.get("web_sources", 0) for r in research_bank)
    sources_count = pkb_sources + web_sources
    tags = extract_tags(plan, topic)
    slug = generate_research_slug(plan.get("title", topic))

    logger.info(
        "Research pipeline complete: '%s' — %d words, %d sources (PKB: %d, Web: %d)",
        plan.get("title", topic), word_count, sources_count, pkb_sources, web_sources,
    )

    return {
        "title": plan.get("title", topic),
        "subtitle": plan.get("subtitle", ""),
        "slug": slug,
        "content_markdown": article_markdown,
        "tags": tags,
        "word_count": word_count,
        "sources_count": sources_count,
        "pkb_sources_count": pkb_sources,
        "web_sources_count": web_sources,
        "sections_count": len(plan.get("outline", [])),
    }
