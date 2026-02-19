"""Phase 4: Section-by-section article writing."""

import json
import logging
import time
from typing import Optional, Callable

from groq import Groq

from backend.config import GROQ_API_KEY, GROQ_MODEL
from backend.research.prompts import (
    SECTION_WRITER_PROMPT,
    INTRO_WRITER_PROMPT,
    CONCLUSION_WRITER_PROMPT,
)

logger = logging.getLogger(__name__)

_last_groq_call = 0.0


def _rate_limited_sleep():
    global _last_groq_call
    elapsed = time.time() - _last_groq_call
    if elapsed < 2:
        time.sleep(2 - elapsed)
    _last_groq_call = time.time()


def write_article(
    plan: dict,
    analysis: dict,
    research_bank: list,
    groq_api_key: Optional[str] = None,
    word_scale: float = 1.0,
    progress_callback: Optional[Callable] = None,
) -> str:
    """
    Write the full article section by section.

    Args:
        word_scale: Multiplier for target word counts (0.3=quick, 1.0=standard, 1.8=deep)

    Returns: Complete article in Markdown.
    """
    key = groq_api_key or GROQ_API_KEY
    client = Groq(api_key=key)

    section_briefs = analysis.get(
        "section_briefs", analysis.get("sections", [])
    )

    # Fallback: create briefs from outline if analysis didn't produce them
    if not section_briefs:
        section_briefs = [
            {"section_title": s, "key_points": [], "target_words": int(1500 * word_scale)}
            for s in plan["outline"]
        ]

    # Scale target words in each brief
    if word_scale != 1.0:
        for brief in section_briefs:
            brief["target_words"] = int(brief.get("target_words", 1500) * word_scale)

    total_sections = len(section_briefs)
    sections_written = []
    full_article = ""

    outline_text = "\n".join(f"- {s}" for s in plan["outline"])
    themes_text = "\n".join(
        f"- {t}" for t in analysis.get("overall_themes", [])
    )

    # --- Write Introduction ---
    if progress_callback:
        progress_callback(1, total_sections + 2, "Writing introduction...")

    _rate_limited_sleep()

    intro_response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": INTRO_WRITER_PROMPT.format(
                title=plan["title"],
                subtitle=plan.get("subtitle", ""),
                outline=outline_text,
                themes=themes_text,
            ),
        }],
        temperature=0.7,
        max_tokens=2000,
    )

    intro = intro_response.choices[0].message.content
    full_article = intro + "\n\n"
    sections_written.append({"title": "Introduction", "summary": intro[:500]})

    # --- Write Each Section ---
    for i, brief in enumerate(section_briefs):
        section_title = brief.get("section_title", f"Section {i + 1}")
        if progress_callback:
            progress_callback(
                i + 2, total_sections + 2, f"Writing: {section_title}"
            )

        section_research = _find_relevant_research(section_title, research_bank)

        prev_summary = "\n".join([
            f"- {s['title']}: {s['summary']}"
            for s in sections_written[-3:]
        ])

        _rate_limited_sleep()

        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{
                    "role": "user",
                    "content": SECTION_WRITER_PROMPT.format(
                        title=plan["title"],
                        subtitle=plan.get("subtitle", ""),
                        tone=plan.get("tone", "analytical and engaging"),
                        section_number=i + 1,
                        total_sections=total_sections,
                        section_title=section_title,
                        key_points=json.dumps(
                            brief.get("key_points", []), indent=2
                        ),
                        data_and_stats=json.dumps(
                            brief.get("data_and_stats", []), indent=2
                        ),
                        analysis_angle=brief.get(
                            "analysis_angle", "Provide thorough analysis"
                        ),
                        transition=brief.get(
                            "transition_from_previous", "Continue naturally"
                        ),
                        target_words=brief.get("target_words", 1500),
                        section_research=section_research[:6000],
                        previous_sections_summary=prev_summary,
                    ),
                }],
                temperature=0.6,
                max_tokens=4000,
            )
            section_text = response.choices[0].message.content
        except Exception as e:
            # Retry once on failure
            logger.warning(
                "Section %d write failed, retrying: %s", i + 1, e
            )
            time.sleep(3)
            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{
                        "role": "user",
                        "content": SECTION_WRITER_PROMPT.format(
                            title=plan["title"],
                            subtitle=plan.get("subtitle", ""),
                            tone=plan.get("tone", "analytical and engaging"),
                            section_number=i + 1,
                            total_sections=total_sections,
                            section_title=section_title,
                            key_points=json.dumps(
                                brief.get("key_points", []), indent=2
                            ),
                            data_and_stats=json.dumps(
                                brief.get("data_and_stats", []), indent=2
                            ),
                            analysis_angle=brief.get(
                                "analysis_angle", "Provide thorough analysis"
                            ),
                            transition=brief.get(
                                "transition_from_previous", "Continue naturally"
                            ),
                            target_words=brief.get("target_words", 1500),
                            section_research=section_research[:6000],
                            previous_sections_summary=prev_summary,
                        ),
                    }],
                    temperature=0.6,
                    max_tokens=4000,
                )
                section_text = response.choices[0].message.content
            except Exception as e2:
                logger.error("Section %d write failed permanently: %s", i + 1, e2)
                section_text = f"## {section_title}\n\n*[Section generation failed]*\n"

        full_article += section_text + "\n\n"
        sections_written.append({
            "title": section_title,
            "summary": section_text[:500],
        })

        logger.info(
            "Wrote section %d/%d: %s (%d words)",
            i + 1, total_sections, section_title, len(section_text.split()),
        )

    # --- Write Conclusion ---
    if progress_callback:
        progress_callback(
            total_sections + 2, total_sections + 2, "Writing conclusion..."
        )

    sections_summary = "\n".join([
        f"- {s['title']}: {s['summary']}" for s in sections_written
    ])
    # Cap to avoid exceeding Groq TPM limit on conclusion call
    if len(sections_summary) > 3000:
        sections_summary = sections_summary[:3000] + "\n[Truncated]"

    _rate_limited_sleep()

    conclusion_response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": CONCLUSION_WRITER_PROMPT.format(
                title=plan["title"],
                themes=themes_text,
                sections_summary=sections_summary,
            ),
        }],
        temperature=0.7,
        max_tokens=3000,
    )

    full_article += conclusion_response.choices[0].message.content

    word_count = len(full_article.split())
    logger.info(
        "Article complete: %d words, %d sections", word_count, total_sections
    )
    return full_article


def _find_relevant_research(section_title: str, research_bank: list) -> str:
    """Find the most relevant research for a given section title.

    Tags PKB vs web sources so the writer can distinguish them.
    """
    section_words = set(section_title.lower().split())

    scored = []
    for subtopic in research_bank:
        heading_words = set(subtopic["heading"].lower().split())
        overlap = len(section_words & heading_words)
        scored.append((overlap, subtopic))

    scored.sort(key=lambda x: x[0], reverse=True)

    formatted = ""
    for _, subtopic in scored[:3]:
        formatted += f"\n### {subtopic['heading']}\n"
        for finding in subtopic["findings"]:
            source_type = finding.get("source_type", "web")
            if source_type == "pkb":
                formatted += "**[PKB — Your existing knowledge:]**\n"
            if finding.get("tavily_answer"):
                formatted += f"{finding['tavily_answer']}\n"
            for result in finding.get("results", [])[:2]:
                prefix = "[PKB] " if source_type == "pkb" else ""
                formatted += (
                    f"- {prefix}{result['title']}: {result['content'][:400]}\n"
                )
        for article in subtopic.get("full_articles", [])[:1]:
            formatted += (
                f"\nDetailed source:\n{article['full_content'][:2000]}\n"
            )

    return formatted
