"""Per-request recorder for AI calls (spec §9: model, prompt version, input, output,
duration, error - traceable to the input that produced them)."""
import contextvars
import time

_CALLS: contextvars.ContextVar[list | None] = contextvars.ContextVar("ai_calls", default=None)


def start() -> None:
    _CALLS.set([])


def collect() -> list[dict]:
    return _CALLS.get() or []


def record(step: str, model: str, prompt_version: str, input_hash: str,
           output: dict | str, usage, duration_ms: int, error: str | None) -> None:
    calls = _CALLS.get()
    if calls is None:
        return
    calls.append({
        "step": step, "model": model, "prompt_version": prompt_version,
        "input_hash": input_hash, "output": output,
        "usage": _usage_dict(usage), "duration_ms": duration_ms, "error": error,
        "ts": time.time(),
    })


def _usage_dict(u):
    if u is None:
        return None
    return {"prompt_tokens": getattr(u, "prompt_tokens", None),
            "completion_tokens": getattr(u, "completion_tokens", None),
            "total_tokens": getattr(u, "total_tokens", None)}
