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
os.environ.setdefault("OPENAI_TIMEOUT_SECONDS", "60")
os.environ.setdefault("OPENAI_MAX_RPM", "600")
os.environ.setdefault("OPENAI_MAX_RETRIES", "3")
os.environ.setdefault("CACHE_TTL_SECONDS", "60")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest


@pytest.fixture(autouse=True)
def _clear_llm_cache():
    """Keep the in-process model cache from leaking results between tests."""
    from app import llm
    llm._cache._data.clear()
    llm._cache.hits = llm._cache.misses = 0
    yield
