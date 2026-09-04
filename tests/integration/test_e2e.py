"""End-to-end suite. One test per row of docs/TODO.md. Skipped unless the stack is up.

Each test imports a fixture through /api/import/eml, waits for the worker, then asserts
the classification / extraction / traceability contract for that scenario.
"""
import httpx
import pytest

from conftest import SAMPLES, wait_ready


def _import(api: str, *eml_names: str) -> str:
    files = [("files", (n, open(SAMPLES / "emails" / n, "rb"), "message/rfc822")) for n in eml_names]
    r = httpx.post(f"{api}/api/import/eml", files=files, timeout=30)
    r.raise_for_status()
    return r.json()[0]


def _buckets(detail: dict) -> set[str]:
    return {c["bucket"] for c in detail["classifications"] if c["applies"]}


def _facts(detail: dict, section: str) -> list[dict]:
    return [f for f in detail["facts"] if f["section"] == section]


# ---- happy path (TODO.md TC table) ----

def test_tc1_full_icsr_email(api):
    d = wait_ready(_import(api, "email_icsr_full.eml"))
    assert "ICSR" in _buckets(d)
    assert any(f["source"] and f["source"]["type"] == "email" for f in d["facts"])
    assert _facts(d, "REACTION"), "reaction fields must be extracted"


def test_tc6_mi_only(api):
    d = wait_ready(_import(api, "email_mi_only.eml"))
    assert _buckets(d) == {"MI"}
    assert _facts(d, "QUESTION")


def test_tc7_pqc_only(api):
    d = wait_ready(_import(api, "email_pqc_only.eml"))
    assert "PQC" in _buckets(d)
    lot = next(f for f in d["facts"] if f["fieldName"] == "batch_or_lot")
    assert lot["fieldValue"] not in (None, "", "Not stated")


def test_tc8_marketing_not_relevant(api):
    d = wait_ready(_import(api, "email_marketing.eml"))
    assert _buckets(d) == {"NOT_RELEVANT"}
    assert d["facts"] == []


def test_tc9_reaction_from_defect_is_multi_label(api):
    d = wait_ready(_import(api, "email_reaction_from_defect.eml"))
    assert {"ICSR", "PQC"}.issubset(_buckets(d))


def test_tc11_vague_email_low_confidence(api):
    d = wait_ready(_import(api, "email_vague.eml"))
    icsr = next((c for c in d["classifications"] if c["bucket"] == "ICSR"), None)
    assert icsr and icsr["confidence"] < 0.6
    assert any(f["fieldValue"] == "Not stated" for f in d["facts"])


# ---- edge cases (TODO.md EC table) ----

def test_ec1_duplicate_message_id_is_noop(api):
    first = _import(api, "email_icsr_full.eml")
    files = [("files", ("email_icsr_full.eml", open(SAMPLES / "emails" / "email_icsr_full.eml", "rb"), "message/rfc822"))]
    again = httpx.post(f"{api}/api/import/eml", files=files, timeout=30).json()
    assert again == [] or again[0] == first


def test_ec3_corrupt_pdf_fails_message_not_queue(api):
    d = wait_ready(_import(api, "email_with_corrupt_pdf.eml"))
    assert d["message"]["status"] == "FAILED"
    assert d["message"]["errorDetail"]


@pytest.mark.parametrize("name", ["email_icsr_full.eml"])
def test_traceability_every_fact_has_a_source(api, name):
    d = wait_ready(_import(api, name))
    for f in d["facts"]:
        if f["fieldValue"] != "Not stated":
            assert f["source"] and f["source"]["type"] in ("email", "pdf")
