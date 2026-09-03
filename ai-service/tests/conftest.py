import os
import sys
from pathlib import Path

# Satisfy config.py (no fallbacks) before app modules import.
os.environ.setdefault("AI_HOST", "0.0.0.0")
os.environ.setdefault("AI_PORT", "8000")
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("OPENAI_MODEL", "gpt-4o")
os.environ.setdefault("PROMPT_VERSION", "test")
os.environ.setdefault("PDF_PAGE_CAP", "120")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
