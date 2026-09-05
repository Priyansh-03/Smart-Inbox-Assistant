"""Output re-validation - a model that got hijacked should still not corrupt our data."""
import logging

from .constants import BUCKETS

log = logging.getLogger("ai-service.validators")

_ALLOWED_SECTIONS = {"PATIENT", "REPORTER", "PRODUCT", "REACTION", "SERIOUSNESS",
                     "NARRATIVE", "COMPLAINT", "QUESTION"}
_ALLOWED_SOURCE_TYPES = {"email", "pdf"}


def clean_verdicts(raw: list[dict]) -> list[dict]:
    """Keep only well-formed verdicts for the four known buckets."""
    out, seen = [], set()
    for v in raw or []:
        b = v.get("bucket")
        if b in BUCKETS and b not in seen:
            seen.add(b)
            out.append({
                "bucket": b,
                "applies": bool(v.get("applies")),
                "confidence": _clamp(v.get("confidence")),
                "reason": str(v.get("reason", ""))[:300],
            })
    dropped = len(raw or []) - len(out)
    if dropped:
        log.warning("validators: dropped %d malformed verdict(s)", dropped)
    return out


def clean_facts(raw: list[dict]) -> list[dict]:
    """Drop facts with an unknown section or malformed source. Confidence may be null
    (an absent field) - only clamp when it is actually numeric."""
    out = []
    for f in raw or []:
        if f.get("section") not in _ALLOWED_SECTIONS:
            continue
        src = f.get("source")
        if src is not None and src.get("type") not in _ALLOWED_SOURCE_TYPES:
            src = None
        conf = f.get("confidence")
        out.append({**f, "source": src, "confidence": None if conf is None else _clamp(conf)})
    dropped = len(raw or []) - len(out)
    if dropped:
        log.warning("validators: dropped %d fact(s) with bad section/source", dropped)
    return out


def _clamp(x):
    try:
        return max(0.0, min(1.0, float(x)))
    except (TypeError, ValueError):
        return 0.0
