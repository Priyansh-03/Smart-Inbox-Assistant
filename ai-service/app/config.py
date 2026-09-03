"""Runtime config from env. No fallbacks - a missing key fails fast at startup."""
import os


def _require(key: str) -> str:
    val = os.getenv(key)
    if val is None or val == "":
        raise RuntimeError(f"required env var not set: {key}")
    return val


class Config:
    HOST = _require("AI_HOST")
    PORT = int(_require("AI_PORT"))
    OPENAI_API_KEY = _require("OPENAI_API_KEY")
    MODEL = _require("OPENAI_MODEL")
    PROMPT_VERSION = _require("PROMPT_VERSION")
    PDF_PAGE_CAP = int(_require("PDF_PAGE_CAP"))


config = Config()
