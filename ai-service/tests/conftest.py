import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]

# Prefer real values from .env.local; fall back to inert stubs so `config` can import
# in CI. These are test-bootstrap only - the app itself takes no defaults.
_ENV_LOCAL = _ROOT / ".env.local"
if _ENV_LOCAL.exists():
    for line in _ENV_LOCAL.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            if v.strip():                       # blank -> let the stub fill it
                os.environ.setdefault(k.strip(), v.strip())

_STUBS = {
    "AI_HOST": "127.0.0.1", "AI_PORT": "8000",
    "OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "gpt-4o",
    "PROMPT_VERSION": "test", "PDF_PAGE_CAP": "120",
    "OPENAI_TIMEOUT_SECONDS": "60", "OPENAI_MAX_RPM": "600",
    "OPENAI_MAX_RETRIES": "3", "CACHE_TTL_SECONDS": "60",
}
for k, v in _STUBS.items():
    os.environ.setdefault(k, v)

sys.path.insert(0, str(_ROOT / "ai-service"))

import pytest


@pytest.fixture(autouse=True)
def _clear_llm_cache():
    """Keep the in-process model cache from leaking results between tests."""
    from app import llm
    llm._cache._data.clear()
    llm._cache.hits = llm._cache.misses = 0
    yield
