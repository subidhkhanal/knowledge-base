import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import tempfile

try:
    import ebooklib
    from ebooklib import epub
    EBOOKLIB_AVAILABLE = True
except ImportError:
    EBOOKLIB_AVAILABLE = False

try:
    from bs4 import BeautifulSoup, Tag
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

# Noise item patterns (case-insensitive)
_NOISE_PATTERNS = re.compile(
    r"(cover|toc|nav|copyright|titlepage|halftitle|colophon|frontmatter)",
    re.IGNORECASE,
)

# Heading tags to track
_HEADING_TAGS = {"h1", "h2", "h3"}


class EPUBProcessor:
    """Process EPUB ebook files with structure-aware extraction."""

    def __init__(self):
        if not EBOOKLIB_AVAILABLE:
            raise ImportError(
                "ebooklib is not installed. Install with: pip install ebooklib"
            )
        if not BS4_AVAILABLE:
            raise ImportError(
                "beautifulsoup4 is not installed. Install with: pip install beautifulsoup4"
            )

    def _is_noise_item(self, item, text: str) -> bool:
        """Check if an EPUB item is noise (cover, TOC, copyright, etc.)."""
        # Too little text content
        if len(text.strip()) < 50:
            return True

        # ID or filename matches noise patterns
        item_id = (item.get_id() or "").lower()
        item_name = (item.get_name() or "").lower()
        if _NOISE_PATTERNS.search(item_id) or _NOISE_PATTERNS.search(item_name):
            return True

        return False

    def _is_mostly_links(self, soup: BeautifulSoup) -> bool:
        """Check if content is primarily navigation links (>80% link text)."""
        all_text = soup.get_text(strip=True)
        if not all_text:
            return True
        link_text = "".join(a.get_text(strip=True) for a in soup.find_all("a"))
        return len(link_text) / len(all_text) > 0.8

    def _preserve_image_alt_text(self, soup: BeautifulSoup) -> None:
        """Replace <img> tags with their alt text inline."""
        for img in soup.find_all("img"):
            alt = img.get("alt", "").strip()
            if alt:
                img.replace_with(f"[Image: {alt}]")
            else:
                img.decompose()

    def _extract_sections(self, html_content: bytes) -> List[Dict[str, Any]]:
        """
        Extract text from HTML preserving heading hierarchy.

        Returns a list of section dicts, each with:
        - text: section content
        - heading: the heading text (or None for content before any heading)
        - heading_level: 1/2/3 (or None)
        - heading_hierarchy: list of heading strings from h1 down
        """
        soup = BeautifulSoup(html_content, "html.parser")

        # Remove non-content elements
        for element in soup(["script", "style", "nav", "header", "footer"]):
            element.decompose()

        # Preserve image alt text before extracting
        self._preserve_image_alt_text(soup)

        # Check if mostly links (navigation page)
        if self._is_mostly_links(soup):
            return []

        body = soup.find("body") or soup

        # Track heading hierarchy: [h1_text, h2_text, h3_text]
        heading_tracker: List[Optional[str]] = [None, None, None]
        sections: List[Dict[str, Any]] = []
        current_text_parts: List[str] = []
        current_heading: Optional[str] = None
        current_level: Optional[int] = None

        def _flush_section():
            """Save the current section if it has content."""
            text = "\n".join(current_text_parts).strip()
            text = re.sub(r"\n{3,}", "\n\n", text)  # collapse excessive newlines
            if text:
                hierarchy = [h for h in heading_tracker if h is not None]
                sections.append({
                    "text": text,
                    "heading": current_heading,
                    "heading_level": current_level,
                    "heading_hierarchy": hierarchy if hierarchy else None,
                })

        for element in body.children:
            if not isinstance(element, Tag):
                # NavigableString (bare text)
                t = element.strip()
                if t:
                    current_text_parts.append(t)
                continue

            tag_name = element.name

            if tag_name in _HEADING_TAGS:
                # Flush previous section
                _flush_section()
                current_text_parts = []

                level = int(tag_name[1])  # h1->1, h2->2, h3->3
                heading_text = element.get_text(strip=True)

                # Update tracker: set this level, clear lower levels
                heading_tracker[level - 1] = heading_text
                for i in range(level, 3):
                    heading_tracker[i] = None

                current_heading = heading_text
                current_level = level
            else:
                # Extract text from this element
                text = element.get_text(separator="\n")
                lines = [line.strip() for line in text.splitlines()]
                cleaned = "\n".join(line for line in lines if line)
                if cleaned:
                    current_text_parts.append(cleaned)

        # Flush the last section
        _flush_section()

        # Fallback: if no sections extracted but there is content, return as single section
        if not sections:
            all_text = body.get_text(separator="\n")
            lines = [line.strip() for line in all_text.splitlines()]
            cleaned = "\n".join(line for line in lines if line)
            if cleaned.strip():
                sections.append({
                    "text": cleaned.strip(),
                    "heading": None,
                    "heading_level": None,
                    "heading_hierarchy": None,
                })

        return sections

    def _process_book(self, book, filename: str) -> List[Dict[str, Any]]:
        """Core processing logic shared by process() and process_bytes()."""
        documents = []
        chapter_num = 0

        # Get book title from metadata
        title = book.get_metadata("DC", "title")
        book_title = title[0][0] if title else Path(filename).stem

        # Use spine for correct reading order
        for item_id, linear in book.spine:
            if linear == "no":
                continue

            item = book.get_item_with_id(item_id)
            if item is None:
                continue

            content = item.get_content()
            sections = self._extract_sections(content)

            if not sections:
                continue

            # Get the chapter title from the first heading in this item
            chapter_title = None
            for sec in sections:
                if sec["heading"] is not None:
                    chapter_title = sec["heading"]
                    break

            chapter_num += 1

            # Check noise after extraction (uses full text of item)
            full_text = "\n".join(s["text"] for s in sections)
            if self._is_noise_item(item, full_text):
                continue

            for section in sections:
                documents.append({
                    "text": section["text"],
                    "source": filename,
                    "source_type": "epub",
                    "chapter": chapter_num,
                    "chapter_id": item.get_id(),
                    "chapter_title": chapter_title,
                    "section_title": section["heading"],
                    "heading_level": section["heading_level"],
                    "heading_hierarchy": section["heading_hierarchy"],
                    "book_title": book_title,
                    "page": None,
                })

        return documents

    def process(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Extract structured text from an EPUB file.

        Args:
            file_path: Path to the EPUB file

        Returns:
            List of dicts with 'text' and metadata (one per section)
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"EPUB file not found: {file_path}")

        book = epub.read_epub(str(file_path))
        return self._process_book(book, file_path.name)

    def process_bytes(self, content: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Process EPUB from bytes (for file uploads).

        Args:
            content: EPUB file content as bytes
            filename: Original filename

        Returns:
            List of dicts with 'text' and metadata (one per section)
        """
        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            book = epub.read_epub(tmp_path)
            return self._process_book(book, filename)
        finally:
            Path(tmp_path).unlink(missing_ok=True)


def is_ebooklib_available() -> bool:
    """Check if ebooklib is available."""
    return EBOOKLIB_AVAILABLE and BS4_AVAILABLE
