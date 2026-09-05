"""OpenAI client wrapper: strict JSON, client-side rate limiting, retry/backoff, TTL cache."""
import json
import logging
import threading
import time
from collections import deque
from pathlib import Path

from openai import (APIConnectionError, APITimeoutError, InternalServerError,
                    OpenAI, RateLimitError)
from tenacity import (retry, retry_if_exception_type, stop_after_attempt,
                      wait_exponential_jitter)

from . import callrec
from .cache import TTLCache, key as cache_key
from .config import config
from .guardrails import UNTRUSTED_SYSTEM_GUARD

log = logging.getLogger("ai-service.llm")

MODEL = config.MODEL
PROMPT_VERSION = config.PROMPT_VERSION
_PROMPTS = Path(__file__).resolve().parent.parent / "prompts"

_client: OpenAI | None = None
_cache = TTLCache(config.CACHE_TTL_SECONDS)
_RETRYABLE = (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError)


class _RpmLimiter:
    """Thread-safe sliding-window limiter: at most `rpm` calls per rolling 60s."""

    def __init__(self, rpm: int):
        self._rpm = rpm
        self._calls: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self._lock:
                now = time.monotonic()
                while self._calls and now - self._calls[0] >= 60:
                    self._calls.popleft()
                if len(self._calls) < self._rpm:
                    self._calls.append(now)
                    return
                wait = 60 - (now - self._calls[0])
            log.warning("rate limiter: %d/%d rpm used, sleeping %.1fs", self._rpm, self._rpm, wait)
            time.sleep(max(wait, 0.05))


_limiter = _RpmLimiter(config.OPENAI_MAX_RPM)


def client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY, timeout=config.OPENAI_TIMEOUT_SECONDS)
        log.info("OpenAI client initialised: model=%s timeout=%ss rpm=%s",
                 MODEL, config.OPENAI_TIMEOUT_SECONDS, config.OPENAI_MAX_RPM)
    return _client


def load_prompt(name: str) -> str:
    return (_PROMPTS / f"{name}.txt").read_text(encoding="utf-8")


def text_part(text: str) -> dict:
    return {"type": "text", "text": text}


def image_part(b64_png: str) -> dict:
    return {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_png}"}}


def _content(user_content) -> list:
    return [text_part(user_content)] if isinstance(user_content, str) else user_content


@retry(retry=retry_if_exception_type(_RETRYABLE),
       wait=wait_exponential_jitter(initial=1, max=60),
       stop=stop_after_attempt(config.OPENAI_MAX_RETRIES),
       reraise=True)
def _create(messages: list, max_tokens: int, temperature: float, json_mode: bool):
    _limiter.acquire()
    kwargs = {"model": MODEL, "max_tokens": max_tokens, "temperature": temperature, "messages": messages}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    return client().chat.completions.create(**kwargs)


def ask_json(system: str, user_content, *, step: str = "call", max_tokens: int = 2000,
             temperature: float = 0.0, retries: int = 1, untrusted_guard: bool = False) -> dict:
    """Model call in JSON mode, cached by request hash and recorded for the audit trail.
    `user_content` is a string or a list of content parts (text_part / image_part).
    Set untrusted_guard=True when the content carries email/PDF text."""
    if untrusted_guard:
        system = UNTRUSTED_SYSTEM_GUARD + "\n\n" + system
    ck = cache_key("json", MODEL, PROMPT_VERSION, temperature, untrusted_guard, system, user_content)
    cached = _cache.get(ck)
    if cached is not None:
        callrec.record(step, MODEL, PROMPT_VERSION, ck, cached, None, 0, None)
        return cached

    messages = [{"role": "system", "content": system},
                {"role": "user", "content": _content(user_content)}]
    last_err = None
    started = time.time()
    for attempt in range(retries + 1):
        resp = _create(messages, max_tokens, temperature, json_mode=True)
        raw = (resp.choices[0].message.content or "").strip()
        try:
            result = json.loads(raw)
        except json.JSONDecodeError as e:
            last_err = e
            log.warning("ask_json invalid JSON on attempt %d: %s", attempt + 1, e)
            if "}" in raw:
                try:
                    result = json.loads(raw[: raw.rindex("}") + 1])
                except json.JSONDecodeError:
                    continue
            else:
                continue
        dur = int((time.time() - started) * 1000)
        log.info("ask_json[%s] ok (attempt %d, %d keys, usage=%s)",
                 step, attempt + 1, len(result), getattr(resp, "usage", None))
        callrec.record(step, MODEL, PROMPT_VERSION, ck, result, getattr(resp, "usage", None), dur, None)
        _cache.put(ck, result)
        return result
    callrec.record(step, MODEL, PROMPT_VERSION, ck, {}, None,
                   int((time.time() - started) * 1000), f"invalid JSON: {last_err}")
    raise ValueError(f"model did not return valid JSON: {last_err}")


def ask_text(system: str, user: str, *, max_tokens: int = 1200, temperature: float = 0.2) -> str:
    ck = cache_key("text", MODEL, PROMPT_VERSION, temperature, system, user)
    cached = _cache.get(ck)
    if cached is not None:
        return cached
    resp = _create([{"role": "system", "content": system}, {"role": "user", "content": user}],
                   max_tokens, temperature, json_mode=False)
    out = (resp.choices[0].message.content or "").strip()
    _cache.put(ck, out)
    return out


def cache_stats() -> dict:
    return _cache.stats()
