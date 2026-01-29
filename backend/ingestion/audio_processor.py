from pathlib import Path
from typing import List, Dict, Any
import tempfile
from datetime import datetime

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

from backend.config import WHISPER_MODEL


class AudioProcessor:
    """Transcribe audio files using local Whisper model."""

    def __init__(self, model_name: str = WHISPER_MODEL):
        if not WHISPER_AVAILABLE:
            raise ImportError(
                "Whisper is not installed. Install with: pip install openai-whisper"
            )
        self.model = whisper.load_model(model_name)

    def process(self, file_path: str | Path) -> List[Dict[str, Any]]:
        """
        Transcribe an audio file.

        Args:
            file_path: Path to the audio file

        Returns:
            List of dicts with 'text' and metadata
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        # Transcribe with timestamps
        result = self.model.transcribe(
            str(file_path),
            verbose=False
        )

        documents = []

        # If segments are available, use them for better granularity
        if result.get("segments"):
            for segment in result["segments"]:
                documents.append({
                    "text": segment["text"].strip(),
                    "source": file_path.name,
                    "source_type": "audio",
                    "start_time": segment["start"],
                    "end_time": segment["end"],
                    "page": None  # Audio doesn't have pages
                })
        else:
            # Fallback to full transcript
            documents.append({
                "text": result["text"].strip(),
                "source": file_path.name,
                "source_type": "audio",
                "page": None
            })

        return documents

    def process_bytes(self, content: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Transcribe audio from bytes (for file uploads).

        Args:
            content: Audio file content as bytes
            filename: Original filename

        Returns:
            List of dicts with 'text' and metadata
        """
        # Whisper requires a file path, so we save to temp file
        suffix = Path(filename).suffix or ".mp3"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            result = self.model.transcribe(tmp_path, verbose=False)

            documents = []

            if result.get("segments"):
                for segment in result["segments"]:
                    documents.append({
                        "text": segment["text"].strip(),
                        "source": filename,
                        "source_type": "audio",
                        "start_time": segment["start"],
                        "end_time": segment["end"],
                        "page": None
                    })
            else:
                documents.append({
                    "text": result["text"].strip(),
                    "source": filename,
                    "source_type": "audio",
                    "page": None
                })

            return documents

        finally:
            # Clean up temp file
            Path(tmp_path).unlink(missing_ok=True)


def is_whisper_available() -> bool:
    """Check if Whisper is available."""
    return WHISPER_AVAILABLE
