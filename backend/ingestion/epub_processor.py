from pathlib import Path
from typing import List, Dict, Any
import tempfile

try:
    import ebooklib
    from ebooklib import epub
    EBOOKLIB_AVAILABLE = True
except ImportError:
    EBOOKLIB_AVAILABLE = False

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False


class EPUBProcessor:
    """Process EPUB ebook files."""

    def __init__(self):
        if not EBOOKLIB_AVAILABLE:
            raise ImportError(
                "ebooklib is not installed. Install with: pip install ebooklib"
            )
        if not BS4_AVAILABLE:
            raise ImportError(
                "beautifulsoup4 is not installed. Install with: pip install beautifulsoup4"
            )

    def _extract_text_from_html(self, html_content: bytes) -> str:
        """Extract plain text from HTML content."""
        soup = BeautifulSoup(html_content, "html.parser")

        # Remove script and style elements
        for element in soup(["script", "style", "nav", "header", "footer"]):
            element.decompose()

        # Get text and clean up whitespace
        text = soup.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines()]
        text = "\n".join(line for line in lines if line)

        return text

    def process(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Extract text from an EPUB file.

        Args:
            file_path: Path to the EPUB file

        Returns:
            List of dicts with 'text' and metadata (one per chapter)
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"EPUB file not found: {file_path}")

        book = epub.read_epub(str(file_path))
        documents = []
        chapter_num = 0

        # Get book title
        title = book.get_metadata("DC", "title")
        book_title = title[0][0] if title else file_path.stem

        # Extract text from each document item
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                content = item.get_content()
                text = self._extract_text_from_html(content)

                if text and text.strip():
                    chapter_num += 1
                    documents.append({
                        "text": text.strip(),
                        "source": file_path.name,
                        "source_type": "epub",
                        "chapter": chapter_num,
                        "chapter_id": item.get_id(),
                        "book_title": book_title,
                        "page": None
                    })

        return documents

    def process_bytes(self, content: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Process EPUB from bytes (for file uploads).

        Args:
            content: EPUB file content as bytes
            filename: Original filename

        Returns:
            List of dicts with 'text' and metadata
        """
        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            book = epub.read_epub(tmp_path)
            documents = []
            chapter_num = 0

            title = book.get_metadata("DC", "title")
            book_title = title[0][0] if title else Path(filename).stem

            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    item_content = item.get_content()
                    text = self._extract_text_from_html(item_content)

                    if text and text.strip():
                        chapter_num += 1
                        documents.append({
                            "text": text.strip(),
                            "source": filename,
                            "source_type": "epub",
                            "chapter": chapter_num,
                            "chapter_id": item.get_id(),
                            "book_title": book_title,
                            "page": None
                        })

            return documents

        finally:
            Path(tmp_path).unlink(missing_ok=True)


def is_ebooklib_available() -> bool:
    """Check if ebooklib is available."""
    return EBOOKLIB_AVAILABLE and BS4_AVAILABLE
