"""LLM-powered conversation-to-article transformation using Groq."""

from typing import List, Dict
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL


STRUCTURING_PROMPT = """You are a technical editor. Transform this raw AI chatbot conversation into a clean, well-structured technical article.

RULES:
1. Extract ONLY the knowledge content. Remove greetings, "thanks", "okay", filler, meta-discussion.
2. Organize into logical sections with clear ## headings (markdown H2).
3. Preserve ALL code snippets exactly as they appear, in ```language blocks.
4. Add a "## Key Takeaways" section at the end with 3-5 bullet points.
5. If there are step-by-step instructions, number them.
6. Write in clear, concise technical prose. NOT a chat log.
7. Output clean Markdown only.
8. Do NOT add information that wasn't in the conversation.
9. Do NOT include any preamble like "Here's the article". Just output the content directly.

TITLE: {title}

RAW CONVERSATION:
{conversation}

STRUCTURED ARTICLE (Markdown):"""


def structure_conversation(conversation: List[Dict[str, str]], title: str) -> str:
    """
    Send raw conversation to Groq LLM to structure into a clean article.

    Args:
        conversation: List of {"role": "user"|"assistant", "content": "..."}
        title: Article title

    Returns:
        Structured article content in Markdown.
    """
    client = Groq(api_key=GROQ_API_KEY)

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
