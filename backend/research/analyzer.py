"""Phase 3: Analyze research bank and create per-section writing briefs."""

import json
import logging
import time
from typing import Optional

from groq import Groq

from backend.config import GROQ_API_KEY, GROQ_MODEL
from backend.research.prompts import ANALYZER_PROMPT

logger = logging.getLogger(__name__)

# Shared rate limiter (same global as planner — imported here for the same pattern)
_last_groq_call = 0.0


def _rate_limited_sleep():
    global _last_groq_call
    elapsed = time.time() - _last_groq_call
    if elapsed < 2:
        time.sleep(2 - elapsed)
    _last_groq_call = time.time()


def analyze_research(
    plan: dict,
    research_bank: list,
    groq_api_key: Optional[str] = None,
) -> dict:
    """
    Analyze all research findings and produce writing briefs per section.

    Args:
        plan: Research plan from planner
        research_bank: List of researched subtopics from researcher
        groq_api_key: Optional BYOK

    Returns:
        dict with section_briefs, overall_themes, contradictions, etc.
    """
    key = groq_api_key or GROQ_API_KEY
    client = Groq(api_key=key)

    formatted_research = _format_research_bank(research_bank)

    # Truncate to fit context (Llama 3.3 70B has 128K context)
    if len(formatted_research) > 80000:
        formatted_research = (
            formatted_research[:80000] + "\n\n[Research truncated for length]"
        )

    outline_text = "\n".join(
        f"{i + 1}. {section}" for i, section in enumerate(plan["outline"])
    )

    _rate_limited_sleep()

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": ANALYZER_PROMPT.format(
                title=plan["title"],
                outline=outline_text,
                research_bank=formatted_research,
            ),
        }],
        temperature=0.3,
        max_tokens=8000,
        response_format={"type": "json_object"},
    )

    analysis = json.loads(response.choices[0].message.content)
    brief_count = len(analysis.get("section_briefs", []))
    logger.info("Analysis complete: %d section briefs", brief_count)
    return analysis


def _format_research_bank(research_bank: list) -> str:
    """Format the research bank into readable text for the LLM."""
    formatted = ""
    for subtopic in research_bank:
        formatted += f"\n\n### {subtopic['heading']}\n"
        formatted += f"Angle: {subtopic['angle']}\n\n"

        for finding in subtopic["findings"]:
            formatted += f"Query: {finding['query']}\n"
            if finding.get("tavily_answer"):
                formatted += f"Summary: {finding['tavily_answer']}\n"
            for result in finding.get("results", [])[:3]:
                formatted += f"- [{result['title']}]({result['url']})\n"
                formatted += f"  {result['content'][:500]}\n"

        for article in subtopic.get("full_articles", []):
            formatted += f"\nFull source: {article['url']}\n"
            formatted += f"{article['full_content'][:2000]}\n"

    return formatted
