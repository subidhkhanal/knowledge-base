"""Phase 1: Topic -> structured research plan (JSON) using Groq."""

import json
import logging
import time
from typing import Optional

from groq import Groq

from backend.config import GROQ_API_KEY, GROQ_MODEL
from backend.research.prompts import PLANNER_PROMPT

logger = logging.getLogger(__name__)

# Rate limiting for Groq free tier (30 RPM)
_last_groq_call = 0.0


def _rate_limited_sleep():
    """Ensure minimum 2-second gap between Groq calls."""
    global _last_groq_call
    elapsed = time.time() - _last_groq_call
    if elapsed < 2:
        time.sleep(2 - elapsed)
    _last_groq_call = time.time()


def create_research_plan(
    topic: str,
    groq_api_key: Optional[str] = None,
    subtopic_range: str = "10-15",
    min_subtopics: int = 5,
) -> dict:
    """
    Turn a topic into a structured research plan.

    Args:
        topic: The research topic string
        groq_api_key: Optional user-provided key (BYOK)
        subtopic_range: e.g. "4-6", "10-15", "15-20"
        min_subtopics: Minimum subtopics required for validation

    Returns:
        dict with keys: title, subtitle, subtopics, outline, tone
    """
    key = groq_api_key or GROQ_API_KEY
    if not key:
        raise ValueError("No Groq API key available.")

    client = Groq(api_key=key)

    _rate_limited_sleep()

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": PLANNER_PROMPT.format(
                topic=topic,
                subtopic_range=subtopic_range,
            ),
        }],
        temperature=0.7,
        max_tokens=4000,
        response_format={"type": "json_object"},
    )

    plan = json.loads(response.choices[0].message.content)

    # Validate minimum structure
    subtopics = plan.get("subtopics", [])
    if len(subtopics) < min_subtopics:
        raise ValueError(
            f"Planner produced only {len(subtopics)} subtopics "
            f"(need at least {min_subtopics})"
        )
    if "outline" not in plan:
        raise ValueError("Planner did not produce an outline")

    logger.info(
        "Research plan: %s, %d subtopics, %d sections",
        plan.get("title", "Untitled"),
        len(subtopics),
        len(plan["outline"]),
    )
    return plan
