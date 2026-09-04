import os
import time
from pathlib import Path

import httpx
import pytest

API = os.getenv("API_BASE_URL", "http://localhost:8080")
POLL_TIMEOUT_S = int(os.getenv("E2E_POLL_TIMEOUT_S", "180"))
REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES = Path(os.getenv("SAMPLE_DIR", REPO_ROOT / "sample-data"))


def _up() -> bool:
    """True only if OUR backend answers with the batch-report shape."""
    try:
        r = httpx.get(f"{API}/api/batch/report", timeout=3)
        return r.status_code == 200 and "rows" in r.json()
    except Exception:
        return False


@pytest.fixture(scope="session")
def api() -> str:
    if not _up():
        pytest.skip(f"stack not reachable at {API} (run: make up, with OPENAI_API_KEY set)")
    return API


@pytest.fixture(scope="session")
def samples() -> Path:
    return SAMPLES


def wait_ready(message_id: str) -> dict:
    """Block until the worker finishes a message, then return its detail payload."""
    deadline = time.time() + POLL_TIMEOUT_S
    while time.time() < deadline:
        d = httpx.get(f"{API}/api/messages/{message_id}", timeout=10).json()
        status = d["message"]["status"]
        if status in ("READY_FOR_REVIEW", "REVIEWED", "FAILED"):
            return d
        time.sleep(3)
    raise TimeoutError(f"message {message_id} not ready in {POLL_TIMEOUT_S}s")
