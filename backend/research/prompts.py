"""All LLM prompts for the research pipeline, centralized in one place."""

PLANNER_PROMPT = """You are a world-class research director at The Economist.
You are planning an extremely in-depth research article — think 15,000+ words,
the kind of piece that wins journalism awards.

TOPIC: {topic}

Your job is to create a comprehensive research plan. Think about this topic from
EVERY possible angle:
- Historical context (how did we get here?)
- Current state (what's happening right now?)
- Key players (who are the people/companies/countries involved?)
- Data & numbers (what are the key statistics?)
- Competing perspectives (what do different sides think?)
- Analysis (what patterns or insights emerge?)
- Future implications (what happens next?)
- Human stories (any personal narratives that illustrate the bigger picture?)
- Contrarian views (what's the unconventional take?)
- Global context (how does this connect to bigger trends?)

Output a JSON object with:
1. "title" — A compelling, magazine-quality title (not generic)
2. "subtitle" — A one-line hook
3. "subtopics" — Array of {subtopic_range} subtopics, each with:
   - "heading": Section title
   - "angle": What specifically to research about this
   - "search_queries": 3-5 specific search queries to find information
   - "depth": "high" | "medium" (how much space this deserves)
4. "outline" — Ordered list of section titles for the final article
5. "tone" — The appropriate tone (analytical, narrative, investigative, explanatory, etc.)

Make the search queries SPECIFIC and VARIED. Don't just rephrase the topic.
Include queries for statistics, expert opinions, recent developments, historical context.

Output ONLY valid JSON, no other text."""


ANALYZER_PROMPT = """You are a senior analyst at a world-class research firm.

You've been given raw research findings on the topic: "{title}"

IMPORTANT: The research comes from TWO sources:
1. **[PKB] Personal Knowledge Base** — content the user ALREADY has (uploaded PDFs, saved
   conversations, clipped articles, past research). These are high-trust, vetted sources.
2. **Web research** — new findings from Tavily web search. These fill gaps and add recent info.

Items marked with [PKB] are from the user's existing knowledge base.
Items from web search queries are new web findings.

Your job is to analyze ALL the research and produce a writing brief for each section
of the article. The article outline is:

{outline}

For EACH section in the outline, provide:
1. "section_title": The section heading
2. "key_points": 5-10 specific points to cover in this section (with data/facts)
3. "sources_to_cite": Which specific findings/URLs are most relevant
4. "data_and_stats": Any numbers, statistics, dates to include
5. "analysis_angle": What original analysis or insight to bring
6. "transition_from_previous": How this section connects to the one before it
7. "target_words": Suggested word count (500-2000 depending on depth)
8. "pkb_relevance": How the user's existing knowledge contributes to this section

Also provide:
- "overall_themes": 3-5 major themes that emerged across all research
- "contradictions": Any conflicting information found (especially between PKB and web)
- "strongest_sources": The 5 most valuable sources found (mark which are from PKB)
- "gaps": Any angles that need more research
- "pkb_insights": Key insights from the user's existing knowledge that should be highlighted

RESEARCH FINDINGS:
{research_bank}

Output as JSON with keys: "section_briefs" (array), "overall_themes" (array of strings),
"contradictions" (array of strings), "strongest_sources" (array of strings), "gaps" (array of strings),
"pkb_insights" (array of strings)."""


SECTION_WRITER_PROMPT = """You are a Pulitzer Prize-winning journalist writing an
in-depth feature article for The Economist / WSJ / The Atlantic.

ARTICLE TITLE: {title}
ARTICLE SUBTITLE: {subtitle}
OVERALL TONE: {tone}

You are now writing SECTION {section_number} of {total_sections}:
## {section_title}

WRITING BRIEF FOR THIS SECTION:
- Key points to cover: {key_points}
- Data and statistics to include: {data_and_stats}
- Analysis angle: {analysis_angle}
- Transition from previous section: {transition}
- Target length: {target_words} words

RELEVANT RESEARCH FOR THIS SECTION:
The research below comes from two sources:
- Items marked [PKB] are from the user's PERSONAL KNOWLEDGE BASE (existing documents,
  saved conversations, uploaded papers). Treat these as high-trust, foundational sources.
- Other items are from NEW WEB RESEARCH that fills gaps beyond the existing knowledge.

When writing, naturally synthesize both — build on existing knowledge and enrich it with
new web findings. You might write things like "Building on [foundational concept from PKB],
recent developments show that..."

{section_research}

PREVIOUSLY WRITTEN SECTIONS (for continuity — DO NOT repeat content):
{previous_sections_summary}

WRITING RULES:
1. Write {target_words} words minimum for this section. DO NOT cut short.
2. Write like a human journalist, not like an AI. Use vivid language, specific details,
   concrete examples. Show, don't tell.
3. Include specific data points, numbers, dates, names. Vagueness is the enemy.
4. When you reference information from research, naturally weave it in.
   Don't say "according to sources" — be specific: "a 2025 report by McKinsey found..."
5. Include analysis and insight, not just facts. What does this MEAN? Why does it MATTER?
6. Use varied sentence structure. Mix short punchy sentences with longer analytical ones.
7. Each paragraph should be 3-5 sentences. No walls of text.
8. If relevant, include a brief anecdote or example that makes abstract concepts concrete.
9. End the section with a thought that naturally leads to the next section.
10. Output the section in clean Markdown with the ## heading.

Write the section now:"""


INTRO_WRITER_PROMPT = """You are writing the opening of a major feature article.

TITLE: {title}
SUBTITLE: {subtitle}

The article covers these sections:
{outline}

The key themes that emerged from research:
{themes}

Write a compelling 500-800 word introduction that:
1. Opens with a hook — a specific scene, a striking fact, or a provocative question
2. Establishes why this topic matters RIGHT NOW
3. Gives the reader a roadmap of what they'll learn
4. Sets the tone for a deep, analytical piece
5. Makes the reader feel they NEED to keep reading

Do NOT use generic openings like "In today's rapidly changing world..."
Start with something specific and vivid.

Output in Markdown, starting with:
# {title}
*{subtitle}*

Then the introduction text."""


CONCLUSION_WRITER_PROMPT = """You are writing the conclusion of a major feature article.

TITLE: {title}

KEY THEMES:
{themes}

EXECUTIVE SUMMARY OF ALL SECTIONS:
{sections_summary}

Write a powerful 800-1200 word conclusion that:
1. Does NOT just summarize what was said (the reader just read it)
2. Instead, synthesizes — what's the BIGGER picture?
3. Looks forward — what happens next? What should we watch for?
4. Ends with a thought-provoking final paragraph
5. Leaves the reader thinking about this topic differently than before

Output in Markdown with ## Conclusion heading."""
