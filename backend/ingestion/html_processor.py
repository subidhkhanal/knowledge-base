from pathlib import Path
from typing import List, Dict, Any, Tuple

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False


class HTMLProcessor:
    """Process HTML files."""

    def __init__(self):
        if not BS4_AVAILABLE:
            raise ImportError(
                "beautifulsoup4 is not installed. Install with: pip install beautifulsoup4"
            )

    def _extract_text(self, html_content: str) -> Tuple[str, str]:
        """Extract plain text and title from HTML content."""
        soup = BeautifulSoup(html_content, "html.parser")

        title_tag = soup.find("title")
        title = title_tag.get_text().strip() if title_tag else None

        for element in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
            element.decompose()

        main_content = soup.find("main") or soup.find("article") or soup.find("body") or soup

        text = main_content.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines()]
        text = "\n".join(line for line in lines if line)

        return text, title

    def process(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Extract text from an HTML file.

        Args:
            file_path: Path to the HTML file

        Returns:
            List of dicts with 'text' and metadata
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"HTML file not found: {file_path}")

        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            html_content = f.read()

        text, title = self._extract_text(html_content)

        if not text.strip():
            return []

        return [{
            "text": text.strip(),
            "source": file_path.name,
            "source_type": "html",
            "title": title,
            "page": None
        }]

    def process_bytes(self, content: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Process HTML from bytes (for file uploads).

        Args:
            content: HTML file content as bytes
            filename: Original filename

        Returns:
            List of dicts with 'text' and metadata
        """
        for encoding in ["utf-8", "latin-1", "cp1252"]:
            try:
                html_content = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            html_content = content.decode("utf-8", errors="ignore")

        text, title = self._extract_text(html_content)

        if not text.strip():
            return []

        return [{
            "text": text.strip(),
            "source": filename,
            "source_type": "html",
            "title": title,
            "page": None
        }]


def is_html_available() -> bool:
    """Check if beautifulsoup4 is available."""
    return BS4_AVAILABLE
