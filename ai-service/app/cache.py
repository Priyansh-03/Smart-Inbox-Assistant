"""In-process TTL cache for model calls. Keyed by a hash of the exact request.

Prototype scope: a single-process dict. Production swaps this for Redis keyed by the
same hash so replicas share hits (see docs/HARDENING.md)."""
import hashlib
import json
import logging
import threading
import time

log = logging.getLogger("ai-service.cache")


def key(*parts: object) -> str:
    blob = json.dumps(parts, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


class TTLCache:
    def __init__(self, ttl_seconds: int, max_entries: int = 2000):
        self._ttl = ttl_seconds
        self._max = max_entries
        self._data: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, k: str):
        with self._lock:
            hit = self._data.get(k)
            if hit and hit[0] > time.time():
                self.hits += 1
                log.info("cache hit %s (hits=%d misses=%d)", k[:12], self.hits, self.misses)
                return hit[1]
            if hit:
                del self._data[k]
            self.misses += 1
            return None

    def put(self, k: str, value: object) -> None:
        with self._lock:
            if len(self._data) >= self._max:
                oldest = min(self._data, key=lambda x: self._data[x][0])
                del self._data[oldest]
            self._data[k] = (time.time() + self._ttl, value)

    def stats(self) -> dict:
        return {"hits": self.hits, "misses": self.misses, "entries": len(self._data)}
