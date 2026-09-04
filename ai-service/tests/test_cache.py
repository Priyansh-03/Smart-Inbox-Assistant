"""TTL cache + rate limiter unit tests (HARDENING.md pillar 3)."""
import time

from app.cache import TTLCache, key
from app.llm import _RpmLimiter


def test_cache_hit_and_miss():
    c = TTLCache(ttl_seconds=60)
    assert c.get("k") is None
    c.put("k", {"v": 1})
    assert c.get("k") == {"v": 1}
    assert c.stats() == {"hits": 1, "misses": 1, "entries": 1}


def test_cache_entry_expires():
    c = TTLCache(ttl_seconds=0)
    c.put("k", 1)
    time.sleep(0.01)
    assert c.get("k") is None


def test_cache_evicts_when_full():
    c = TTLCache(ttl_seconds=60, max_entries=2)
    c.put("a", 1); c.put("b", 2); c.put("c", 3)
    assert len(c._data) == 2


def test_key_is_stable_and_order_independent():
    assert key("a", {"x": 1, "y": 2}) == key("a", {"y": 2, "x": 1})
    assert key("a", 1) != key("a", 2)


def test_rpm_limiter_blocks_when_window_full():
    lim = _RpmLimiter(rpm=2)
    lim.acquire(); lim.acquire()          # fills the window
    start = time.monotonic()
    lim._calls[0] = start - 59.8          # oldest call ages out in ~0.2s
    lim.acquire()
    assert time.monotonic() - start >= 0.1
