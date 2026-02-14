import io
from pathlib import Path
from typing import List, Dict, Any
import pdfplumber


class PDFProcessor:
    """Extract text and tables from PDF files with page metadata."""

    def _extract_tables(self, page) -> str:
        """Extract tables from a page and format as markdown."""
        tables = page.extract_tables()
        if not tables:
            return ""

        table_texts = []
        for table in tables:
            if not table or not table[0]:
                continue
            headers = table[0]
            header_row = "| " + " | ".join(str(h or "") for h in headers) + " |"
            separator = "| " + " | ".join("---" for _ in headers) + " |"
            rows = []
            for row in table[1:]:
                rows.append("| " + " | ".join(str(c or "") for c in row) + " |")
            table_texts.append("\n".join([header_row, separator] + rows))

        return "\n\n".join(table_texts)

    def process(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Extract text and tables from a PDF file.

        Args:
            file_path: Path to the PDF file

        Returns:
            List of dicts with 'text', 'page', and 'source' keys
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"PDF file not found: {file_path}")

        documents = []
        with pdfplumber.open(str(file_path)) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                table_text = self._extract_tables(page)

                combined = text.strip()
                if table_text:
                    combined += "\n\n[Tables]\n" + table_text

                if combined.strip():
                    documents.append({
                        "text": combined.strip(),
                        "page": page_num,
                        "source": file_path.name,
                        "source_type": "pdf",
                        "has_tables": bool(table_text)
                    })

        return documents

    def process_bytes(self, content: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Extract text and tables from PDF bytes (for file uploads).

        Args:
            content: PDF file content as bytes
            filename: Original filename for metadata

        Returns:
            List of dicts with 'text', 'page', and 'source' keys
        """
        documents = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                table_text = self._extract_tables(page)

                combined = text.strip()
                if table_text:
                    combined += "\n\n[Tables]\n" + table_text

                if combined.strip():
                    documents.append({
                        "text": combined.strip(),
                        "page": page_num,
                        "source": filename,
                        "source_type": "pdf",
                        "has_tables": bool(table_text)
                    })

        return documents
