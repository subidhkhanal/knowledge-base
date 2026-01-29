from pathlib import Path
from typing import List, Dict, Any
from PyPDF2 import PdfReader


class PDFProcessor:
    """Extract text from PDF files with page metadata."""

    def process(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Extract text from a PDF file.

        Args:
            file_path: Path to the PDF file

        Returns:
            List of dicts with 'text', 'page', and 'source' keys
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"PDF file not found: {file_path}")

        reader = PdfReader(str(file_path))
        documents = []

        for page_num, page in enumerate(reader.pages, start=1):
            text = page.extract_text()
            if text and text.strip():
                documents.append({
                    "text": text.strip(),
                    "page": page_num,
                    "source": file_path.name,
                    "source_type": "pdf"
                })

        return documents

    def process_bytes(self, content: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Extract text from PDF bytes (for file uploads).

        Args:
            content: PDF file content as bytes
            filename: Original filename for metadata

        Returns:
            List of dicts with 'text', 'page', and 'source' keys
        """
        import io
        reader = PdfReader(io.BytesIO(content))
        documents = []

        for page_num, page in enumerate(reader.pages, start=1):
            text = page.extract_text()
            if text and text.strip():
                documents.append({
                    "text": text.strip(),
                    "page": page_num,
                    "source": filename,
                    "source_type": "pdf"
                })

        return documents
