"""LLM-powered conversation/article transformation using Groq."""

import logging
from typing import List, Dict, Optional
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger(__name__)


STRUCTURING_PROMPT = """You are an editor. Reformat this raw AI chatbot conversation into a well-structured article. The conversation can be about any topic — programming, planning, learning, or anything else.

CRITICAL: The article MUST be approximately the same length as the input. Do NOT shorten, condense, or summarize. Every piece of information from the conversation must appear in the article.

RULES:
1. Preserve ALL specific details: names, tools, decisions, examples, numbers, links, and any concrete information mentioned in the conversation.
2. Organize into logical sections with clear ## headings (markdown H2).
3. Preserve ALL code snippets exactly as they appear, in ```language blocks.
4. Include EVERY distinct topic, concept, decision, and explanation. If it was discussed, it must be in the article.
5. Use simple, clear language. Write as if explaining to someone new to the topic.
6. Where the conversation describes a process or flow, use a step-by-step list or a Mermaid flowchart (```mermaid) to illustrate it.
7. Remove only true filler (greetings, "thanks", "okay") but keep ALL substantive discussion including reasoning, trade-offs, and alternatives considered.
8. Output clean Markdown only.
9. Do NOT add information that wasn't in the conversation.
10. Do NOT include any preamble like "Here's the article". Just output the content directly.

TITLE: {title}

RAW CONVERSATION:
{conversation}

STRUCTURED ARTICLE (Markdown):"""


def _resolve_groq_key(groq_api_key: Optional[str] = None) -> str:
    """Resolve Groq API key: user-provided > server default."""
    key = groq_api_key or GROQ_API_KEY
    if not key:
        raise ValueError(
            "No Groq API key available. Provide one via the X-Groq-API-Key header "
            "or get a free key at https://console.groq.com"
        )
    return key


def structure_conversation(
    conversation: List[Dict[str, str]],
    title: str,
    groq_api_key: Optional[str] = None,
) -> str:
    """
    Send raw conversation to Groq LLM to structure into a clean article.

    Args:
        conversation: List of {"role": "user"|"assistant", "content": "..."}
        title: Article title
        groq_api_key: Optional user-provided Groq API key (BYOK)

    Returns:
        Structured article content in Markdown.
    """
    client = Groq(api_key=_resolve_groq_key(groq_api_key))

    # Single-message paste: use raw text directly (no "Assistant:" wrapper)
    if len(conversation) == 1:
        conv_text = conversation[0]["content"]
    else:
        conv_text = _format_conversation(conversation)

    logger.info(f"Structurer input: {len(conv_text)} chars, title: {title}")

    # Process in segments so LLM preserves detail instead of summarizing
    MAX_CHARS = 12000

    if len(conv_text) > MAX_CHARS:
        return _structure_in_chunks(client, conv_text, title, MAX_CHARS)

    return _call_groq(client, title, conv_text)


def _format_conversation(conversation: List[Dict[str, str]]) -> str:
    """Convert conversation list to readable text."""
    parts = []
    for msg in conversation:
        label = "User" if msg["role"] == "user" else "Assistant"
        parts.append(f"\n{label}: {msg['content']}\n")
    return "".join(parts)


def _call_groq(client: Groq, title: str, conv_text: str) -> str:
    """Make a single Groq API call to structure conversation text."""
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": STRUCTURING_PROMPT.format(title=title, conversation=conv_text),
        }],
        temperature=0.3,
        max_tokens=32768,
    )
    result = response.choices[0].message.content
    logger.info(f"Structurer output: {len(result)} chars (finish_reason={response.choices[0].finish_reason})")
    return result


def _structure_in_chunks(
    client: Groq, conv_text: str, title: str, max_chars: int
) -> str:
    """Structure a long conversation by processing paragraph-aligned parts."""
    paragraphs = conv_text.split("\n\n")
    parts = []
    current_chunk = ""
    chunk_num = 1

    for para in paragraphs:
        if len(current_chunk) + len(para) + 2 > max_chars and current_chunk:
            part_title = f"{title} (Part {chunk_num})"
            logger.info(f"Processing chunk {chunk_num}: {len(current_chunk)} chars")
            parts.append(_call_groq(client, part_title, current_chunk))
            current_chunk = para
            chunk_num += 1
        else:
            current_chunk = current_chunk + "\n\n" + para if current_chunk else para

    if current_chunk.strip():
        part_title = f"{title} (Part {chunk_num})" if chunk_num > 1 else title
        logger.info(f"Processing chunk {chunk_num}: {len(current_chunk)} chars")
        parts.append(_call_groq(client, part_title, current_chunk))

    logger.info(f"Structured {chunk_num} chunks, total output: {sum(len(p) for p in parts)} chars")
    return "\n\n".join(parts)


# --- HTML article structuring ---

HTML_STRUCTURING_PROMPT = """You are a senior content designer creating a beautifully structured HTML article. Your output should look like a polished, professionally designed document — similar to a high-quality technical blog post or a Claude artifact.

You are generating inner HTML that will be rendered inside a container with pre-existing CSS styles. All visual styling is handled by CSS — you just need to use the correct HTML elements and class names listed below.

DESIGN PRINCIPLES:
- Strong visual hierarchy: clear sections with distinct headings, generous spacing between sections.
- Rich formatting: use callouts, step cards, key points, tables, and code blocks generously wherever appropriate.
- Break up text walls: NEVER have more than 2-3 consecutive paragraphs without a visual break element (heading, list, callout, code block, table, or horizontal rule).
- Use emphasis purposefully: <strong> for important terms on first mention, <em> for subtle emphasis.

AVAILABLE HTML COMPONENTS (use these exactly as shown):

1. SECTION HEADINGS:
   <h2>Major Section Title</h2>
   <h3>Subsection Title</h3>

2. PARAGRAPHS:
   <p>Body text with <strong>bold terms</strong> and <em>emphasis</em> as needed.</p>

3. CALLOUT BOX — for important notes, tips, or highlighted information:
   <div class="callout">
     <strong>Important Note</strong>
     <p>This is critical information the reader should pay attention to.</p>
   </div>

4. WARNING CALLOUT — for warnings or caveats:
   <div class="callout-warning">
     <strong>Warning</strong>
     <p>Be careful about this particular aspect.</p>
   </div>

5. SUCCESS CALLOUT — for positive outcomes or confirmations:
   <div class="callout-success">
     <strong>Result</strong>
     <p>This approach worked successfully.</p>
   </div>

6. STEP CARDS — for sequential processes or tutorials:
   <div class="step-card">
     <span class="step-number">1</span>
     <div>
       <strong>Step Title</strong>
       <p>Detailed explanation of what to do in this step.</p>
     </div>
   </div>

7. KEY POINT — for takeaways, conclusions, or important insights:
   <div class="key-point">
     <strong>Key Takeaway:</strong> The main insight or actionable conclusion from this section.
   </div>

8. CODE BLOCKS — for code, commands, or technical output:
   <pre><code class="language-python">def example():
       return "hello"</code></pre>
   IMPORTANT: Escape ALL HTML entities inside code: &lt; &gt; &amp; &quot;

9. INLINE CODE — for referencing code within text:
   <p>Use the <code>useState</code> hook to manage state.</p>

10. UNORDERED LISTS:
    <ul>
      <li>First item with explanation</li>
      <li>Second item with explanation</li>
    </ul>

11. ORDERED LISTS:
    <ol>
      <li>First ranked or sequential item</li>
      <li>Second item</li>
    </ol>

12. TABLES — for comparisons or structured data:
    <table>
      <thead><tr><th>Column A</th><th>Column B</th></tr></thead>
      <tbody>
        <tr><td>Value 1</td><td>Value 2</td></tr>
      </tbody>
    </table>

13. BLOCKQUOTES — for quotes or cited text:
    <blockquote><p>Quoted text goes here.</p></blockquote>

14. HORIZONTAL RULES — to separate major sections:
    <hr>

CONTENT RULES:
1. Output ONLY inner HTML — absolutely no <html>, <head>, <body>, <style>, or <script> tags.
2. Preserve ALL content from the input. Do NOT summarize, shorten, or omit anything. The article must be approximately the same length as the input.
3. Start with an <h2> for the first major section. The page already displays the title as <h1>.
4. When content describes a process or workflow, ALWAYS use step-card divs.
5. When content has a key insight or conclusion, ALWAYS use a key-point div.
6. When content has an important caveat, note, or tip, ALWAYS use a callout div.
7. Ensure every code snippet is wrapped in <pre><code class="language-xxx">.
8. Use <strong> to highlight the first occurrence of important technical terms.
9. Do NOT add information not present in the source material.
10. Do NOT include any preamble like "Here is the article". Start directly with the first <h2>.

TITLE: {title}

RAW CONTENT:
{conversation}

HTML CONTENT:"""


def structure_to_html(
    raw_text: str,
    title: str,
    groq_api_key: Optional[str] = None,
) -> str:
    """
    Convert raw conversation text into structured HTML using multi-call LLM processing.

    Args:
        raw_text: Raw conversation text (from paste or formatted messages)
        title: Article title
        groq_api_key: Optional user-provided Groq API key

    Returns:
        HTML content string (inner HTML, no document wrapper).
    """
    client = Groq(api_key=_resolve_groq_key(groq_api_key))

    logger.info(f"HTML structurer input: {len(raw_text)} chars, title: {title}")

    MAX_CHARS = 12000

    if len(raw_text) > MAX_CHARS:
        return _structure_html_in_chunks(client, raw_text, title, MAX_CHARS)

    return _call_groq_html(client, title, raw_text)


def _call_groq_html(client: Groq, title: str, conv_text: str) -> str:
    """Make a single Groq API call to generate HTML content."""
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": HTML_STRUCTURING_PROMPT.format(title=title, conversation=conv_text),
        }],
        temperature=0.2,
        max_tokens=32768,
    )
    result = response.choices[0].message.content
    logger.info(f"HTML structurer output: {len(result)} chars (finish_reason={response.choices[0].finish_reason})")
    return result


def _structure_html_in_chunks(
    client: Groq, conv_text: str, title: str, max_chars: int
) -> str:
    """Generate HTML by processing paragraph-aligned parts."""
    paragraphs = conv_text.split("\n\n")
    parts = []
    current_chunk = ""
    chunk_num = 1

    for para in paragraphs:
        if len(current_chunk) + len(para) + 2 > max_chars and current_chunk:
            part_title = f"{title} (Part {chunk_num})"
            logger.info(f"HTML chunk {chunk_num}: {len(current_chunk)} chars")
            parts.append(_call_groq_html(client, part_title, current_chunk))
            current_chunk = para
            chunk_num += 1
        else:
            current_chunk = current_chunk + "\n\n" + para if current_chunk else para

    if current_chunk.strip():
        part_title = f"{title} (Part {chunk_num})" if chunk_num > 1 else title
        logger.info(f"HTML chunk {chunk_num}: {len(current_chunk)} chars")
        parts.append(_call_groq_html(client, part_title, current_chunk))

    logger.info(f"HTML structured {chunk_num} chunks, total output: {sum(len(p) for p in parts)} chars")
    return "\n".join(parts)


# --- Web article structuring ---

WEB_ARTICLE_PROMPT = """You are a technical editor. Clean up and structure this web article content into a well-organized Markdown document.

RULES:
1. Preserve the key content and meaning of the article.
2. Organize into logical sections with clear ## headings (markdown H2).
3. Preserve ALL code snippets exactly as they appear, in ```language blocks.
4. Remove navigation elements, ads, footers, and other non-content text.
5. Add a "## Key Takeaways" section at the end with 3-5 bullet points.
6. Write in clear, concise prose.
7. Output clean Markdown only.
8. Do NOT add information that wasn't in the original article.
9. Do NOT include any preamble like "Here's the article". Just output the content directly.

TITLE: {title}
SOURCE URL: {url}

RAW ARTICLE CONTENT:
{content}

STRUCTURED ARTICLE (Markdown):"""


def structure_web_article(
    content: str,
    title: str,
    url: str,
    groq_api_key: Optional[str] = None,
) -> str:
    """
    Structure a web article's raw text content into a clean Markdown article.

    Args:
        content: Raw text content extracted by Readability.js
        title: Article title
        url: Original article URL
        groq_api_key: Optional user-provided Groq API key

    Returns:
        Structured article content in Markdown.
    """
    client = Groq(api_key=_resolve_groq_key(groq_api_key))

    MAX_CHARS = 60000

    if len(content) > MAX_CHARS:
        # Process in chunks for very long articles
        parts = []
        for i in range(0, len(content), MAX_CHARS):
            chunk = content[i : i + MAX_CHARS]
            chunk_num = i // MAX_CHARS + 1
            part_title = f"{title} (Part {chunk_num})"
            parts.append(_call_web_article_groq(client, part_title, url, chunk))
        return "\n\n".join(parts)

    return _call_web_article_groq(client, title, url, content)


def _call_web_article_groq(client: Groq, title: str, url: str, content: str) -> str:
    """Make a single Groq API call to structure web article content."""
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": WEB_ARTICLE_PROMPT.format(title=title, url=url, content=content),
        }],
        temperature=0.3,
        max_tokens=32768,
    )
    return response.choices[0].message.content
