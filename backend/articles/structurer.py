"""LLM-powered article HTML generation using Groq."""

import logging
from typing import Optional
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger(__name__)


def _resolve_groq_key(groq_api_key: Optional[str] = None) -> str:
    """Resolve Groq API key: user-provided > server default."""
    key = groq_api_key or GROQ_API_KEY
    if not key:
        raise ValueError(
            "No Groq API key available. Provide one via the X-Groq-API-Key header "
            "or get a free key at https://console.groq.com"
        )
    return key


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
