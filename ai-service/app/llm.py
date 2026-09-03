"""Thin wrapper around the Anthropic client with strict-JSON helpers."""
import json
import logging
from pathlib import Path

from anthropic import Anthropic

from .config import config

log = logging.getLogger("ai-service.llm")

MODEL = config.MODEL
PROMPT_VERSION = config.PROMPT_VERSION
_PROMPTS = Path(__file__).resolve().parent.parent / "prompts"

_client: Anthropic | None = None


def client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
        log.info("Anthropic client initialised for model %s", MODEL)
    return _client


def load_prompt(name: str) -> str:
    return (_PROMPTS / f"{name}.txt").read_text(encoding="utf-8")


def _extract_text(msg) -> str:
    return "".join(b.text for b in msg.content if b.type == "text").strip()


def ask_json(system: str, user_content, *, max_tokens: int = 2000, retries: int = 1) -> dict:
    """Call the model and parse the reply as JSON. Prefill '{' to force an object.
    `user_content` may be a string or a list of Anthropic content blocks (for images)."""
    if isinstance(user_content, str):
        user_content = [{"type": "text", "text": user_content}]
    messages = [
        {"role": "user", "content": user_content},
        {"role": "assistant", "content": "{"},
    ]
    last_err = None
    for attempt in range(retries + 1):
        msg = client().messages.create(
            model=MODEL, max_tokens=max_tokens, system=system, messages=messages
        )
        raw = "{" + _extract_text(msg)
        try:
            result = json.loads(raw)
            log.info("ask_json ok (attempt %d, %d keys)", attempt + 1, len(result))
            return result
        except json.JSONDecodeError as e:
            last_err = e
            log.warning("ask_json invalid JSON on attempt %d: %s", attempt + 1, e)
            # trim to the last closing brace and retry parse
            if "}" in raw:
                try:
                    return json.loads(raw[: raw.rindex("}") + 1])
                except json.JSONDecodeError:
                    pass
    raise ValueError(f"model did not return valid JSON: {last_err}")


def ask_text(system: str, user: str, *, max_tokens: int = 1200) -> str:
    msg = client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return _extract_text(msg)
