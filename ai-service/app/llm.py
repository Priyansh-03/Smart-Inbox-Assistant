"""Thin wrapper around the OpenAI client with strict-JSON helpers."""
import json
import logging
from pathlib import Path

from openai import OpenAI

from .config import config

log = logging.getLogger("ai-service.llm")

MODEL = config.MODEL
PROMPT_VERSION = config.PROMPT_VERSION
_PROMPTS = Path(__file__).resolve().parent.parent / "prompts"

_client: OpenAI | None = None


def client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
        log.info("OpenAI client initialised for model %s", MODEL)
    return _client


def load_prompt(name: str) -> str:
    return (_PROMPTS / f"{name}.txt").read_text(encoding="utf-8")


def text_part(text: str) -> dict:
    return {"type": "text", "text": text}


def image_part(b64_png: str) -> dict:
    return {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_png}"}}


def _content(user_content) -> list:
    return [text_part(user_content)] if isinstance(user_content, str) else user_content


def ask_json(system: str, user_content, *, max_tokens: int = 2000, retries: int = 1) -> dict:
    """Call the model in JSON mode and parse the reply. `user_content` is a string or a
    list of content parts (use text_part / image_part)."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": _content(user_content)},
    ]
    last_err = None
    for attempt in range(retries + 1):
        resp = client().chat.completions.create(
            model=MODEL, max_tokens=max_tokens, messages=messages,
            response_format={"type": "json_object"},
        )
        raw = (resp.choices[0].message.content or "").strip()
        try:
            result = json.loads(raw)
            log.info("ask_json ok (attempt %d, %d keys)", attempt + 1, len(result))
            return result
        except json.JSONDecodeError as e:
            last_err = e
            log.warning("ask_json invalid JSON on attempt %d: %s", attempt + 1, e)
            if "}" in raw:
                try:
                    return json.loads(raw[: raw.rindex("}") + 1])
                except json.JSONDecodeError:
                    pass
    raise ValueError(f"model did not return valid JSON: {last_err}")


def ask_text(system: str, user: str, *, max_tokens: int = 1200) -> str:
    resp = client().chat.completions.create(
        model=MODEL, max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    return (resp.choices[0].message.content or "").strip()
