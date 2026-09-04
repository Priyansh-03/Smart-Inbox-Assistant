"""Per-stage endpoint wiring (spec §16: every stage runnable on its own)."""
from fastapi.testclient import TestClient

from app import main
from app.schemas import BucketVerdict, Fact, PdfResult

client = TestClient(main.app)


def test_health_reports_model_and_cache():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and "cache" in body


def test_pdf_stage(monkeypatch):
    monkeypatch.setattr(main, "process_pdf",
                        lambda name, data: PdfResult(filename=name, flavor="DIGITAL", summary="s"))
    r = client.post("/ai/v1/pdf", json={"filename": "a.pdf", "base64": "QUJD"})
    assert r.status_code == 200
    assert r.json()["flavor"] == "DIGITAL"


def test_classify_stage(monkeypatch):
    monkeypatch.setattr(main, "classify_context",
                        lambda *a, **k: [BucketVerdict(bucket="ICSR", applies=True, confidence=0.9, reason="r")])
    r = client.post("/ai/v1/classify", json={"email_body": "took drug, got rash"})
    assert r.status_code == 200
    assert r.json()["classifications"][0]["bucket"] == "ICSR"


def test_extract_stage(monkeypatch):
    monkeypatch.setattr(main, "extract_from_chunks",
                        lambda cats, chunks: [Fact(section="PATIENT", field_name="age", value="54", confidence=0.9)])
    r = client.post("/ai/v1/extract", json={"categories": ["ICSR"], "context_chunks": ["[email]\n..."]})
    assert r.status_code == 200
    assert r.json()["facts"][0]["value"] == "54"


def test_stage_failure_is_502(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("model down")
    monkeypatch.setattr(main, "classify_context", boom)
    r = client.post("/ai/v1/classify", json={"email_body": "x"})
    assert r.status_code == 502
    assert "model down" in r.json()["detail"]
