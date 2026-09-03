import os
import time

import httpx
import pytest

API = os.getenv("API_BASE_URL", "http://localhost:8080")
POLL_TIMEOUT_S = int(os.getenv("E2E_POLL_TIMEOUT_S", "180"))


def _up() -> bool:
    try:
        return httpx.get(f"{API}/api/batch/report", timeout=3).status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _up(), reason="stack not running (make up)")


@pytest.fixture(scope="session")
def api() -> str:
    return API


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
