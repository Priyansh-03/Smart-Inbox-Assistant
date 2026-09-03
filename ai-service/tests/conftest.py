import os
import sys
from pathlib import Path

# Satisfy config.py (no fallbacks) before app modules import.
os.environ.setdefault("AI_HOST", "0.0.0.0")
os.environ.setdefault("AI_PORT", "8000")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("ANTHROPIC_MODEL", "claude-sonnet-5")
os.environ.setdefault("PROMPT_VERSION", "test")
os.environ.setdefault("PDF_PAGE_CAP", "120")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
