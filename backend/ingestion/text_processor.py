from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime


class TextProcessor:
    """Process text and markdown files."""

    # Encodings to try in order of preference
    ENCODINGS = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']

    def _decode_bytes(self, content: bytes) -> str:
        """Decode bytes trying multiple encodings."""
        for encoding in self.ENCODINGS:
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
        # Last resort: decode with replacement characters
        return content.decode('utf-8', errors='replace')

    def process(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Read text from a file.

        Args:
            file_path: Path to the text file

        Returns:
            List of dicts with 'text' and metadata
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(file_path, "rb") as f:
            content = f.read()
        text = self._decode_bytes(content)

        return [{
            "text": text.strip(),
            "source": file_path.name,
            "source_type": "text",
            "page": None
        }]

    def process_text(self, content: str, title: str = "Untitled Note") -> List[Dict[str, Any]]:
        """
        Process direct text input.

        Args:
            content: Text content
            title: Title/name for the note

        Returns:
            List of dicts with 'text' and metadata
        """
        timestamp = datetime.now().isoformat()

        return [{
            "text": content.strip(),
            "source": title,
            "source_type": "note",
            "page": None,
            "timestamp": timestamp
        }]

    def process_bytes(self, content: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Process uploaded text file bytes.

        Args:
            content: File content as bytes
            filename: Original filename

        Returns:
            List of dicts with 'text' and metadata
        """
        text = self._decode_bytes(content)

        return [{
            "text": text.strip(),
            "source": filename,
            "source_type": "text",
            "page": None
        }]
