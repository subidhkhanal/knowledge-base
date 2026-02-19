"""LLM-powered conversation/article transformation using Groq."""

from typing import List, Dict, Optional
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL


STRUCTURING_PROMPT = """You are an editor. Transform this raw AI chatbot conversation into a clean, well-structured article.

RULES:
1. Extract ONLY the knowledge content. Remove greetings, "thanks", "okay", filler, meta-discussion.
2. Organize into logical sections with clear ## headings (markdown H2).
3. Preserve ALL code snippets exactly as they appear, in ```language blocks.
4. Add a "## Key Takeaways" section at the end with 3-5 bullet points.
5. If there are step-by-step instructions, number them.
6. Write in clear, concise prose. NOT a chat log.
7. Output clean Markdown only.
8. Do NOT add information that wasn't in the conversation.
9. Do NOT include any preamble like "Here's the article". Just output the content directly.

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

    conv_text = _format_conversation(conversation)

    # Groq free tier safe limit (~15K tokens)
    MAX_CHARS = 60000

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
        max_tokens=4000,
    )
    return response.choices[0].message.content


def _structure_in_chunks(
    client: Groq, conv_text: str, title: str, max_chars: int
) -> str:
    """Structure a long conversation by processing it in parts."""
    parts = []
    for i in range(0, len(conv_text), max_chars):
        chunk = conv_text[i : i + max_chars]
        chunk_num = i // max_chars + 1
        part_title = f"{title} (Part {chunk_num})"
        parts.append(_call_groq(client, part_title, chunk))

    return "\n\n".join(parts)


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
        max_tokens=4000,
    )
    return response.choices[0].message.content
