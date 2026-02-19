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

# Groq free tier: 12K TPM for llama-3.3-70b-versatile
# Total tokens = input tokens + max_tokens (requested output)
_TPM_BUDGET = 11000  # safe margin under 12K
_MAX_OUTPUT_TOKENS = 3500


def _estimate_tokens(text: str) -> int:
    """Conservative token estimate (1 token ≈ 3 chars for mixed content)."""
    return len(text) // 3


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

    outline_text = "\n".join(
        f"{i + 1}. {section}" for i, section in enumerate(plan["outline"])
    )

    # Build the prompt shell (without research) to measure its token cost
    prompt_shell = ANALYZER_PROMPT.format(
        title=plan["title"],
        outline=outline_text,
        research_bank="",
    )
    shell_tokens = _estimate_tokens(prompt_shell)

    # Token budget remaining for the research bank
    research_token_budget = _TPM_BUDGET - shell_tokens - _MAX_OUTPUT_TOKENS
    research_char_budget = max(research_token_budget * 3, 3000)  # floor at 3K chars

    logger.info(
        "Analyzer budget: %d TPM, %d shell tokens, %d output tokens → "
        "%d tokens (%d chars) for research",
        _TPM_BUDGET, shell_tokens, _MAX_OUTPUT_TOKENS,
        research_token_budget, research_char_budget,
    )

    formatted_research = _format_research_bank(research_bank)

    # Truncate to fit the token budget
    if len(formatted_research) > research_char_budget:
        formatted_research = (
            formatted_research[:research_char_budget]
            + "\n\n[Research truncated to fit token budget]"
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
        max_tokens=_MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
    )

    analysis = json.loads(response.choices[0].message.content)
    brief_count = len(analysis.get("section_briefs", []))
    logger.info("Analysis complete: %d section briefs", brief_count)
    return analysis


def _format_research_bank(research_bank: list) -> str:
    """Format the research bank into readable text for the LLM.

    Separates PKB (existing knowledge) and web findings so the analyzer
    knows what the user already had vs what's new from the web.
    Uses compressed formatting to stay within Groq free-tier token limits.
    """
    formatted = ""
    for subtopic in research_bank:
        formatted += f"\n\n### {subtopic['heading']}\n"
        formatted += f"Angle: {subtopic['angle']}\n"

        pkb_count = subtopic.get("pkb_sources", 0)
        web_count = subtopic.get("web_sources", 0)
        if pkb_count > 0:
            formatted += f"(PKB: {pkb_count}, Web: {web_count})\n\n"
        else:
            formatted += "\n"

        for finding in subtopic["findings"]:
            source_type = finding.get("source_type", "web")
            if source_type == "pkb":
                formatted += "**[PKB]:**\n"
            else:
                formatted += f"Q: {finding['query']}\n"

            tavily_answer = finding.get("tavily_answer", "")
            if tavily_answer:
                formatted += f"Summary: {tavily_answer[:150]}\n"
            for result in finding.get("results", [])[:2]:
                prefix = "[PKB] " if source_type == "pkb" else ""
                formatted += f"- {prefix}{result['title']}: {result['content'][:300]}\n"

        for article in subtopic.get("full_articles", [])[:1]:
            formatted += f"\nSource ({article['url']}):\n"
            formatted += f"{article['full_content'][:800]}\n"

    return formatted
