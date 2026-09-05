"""AI-call recorder (spec §9)."""
from app import callrec, pipeline
from app.pipeline import run
from app.schemas import ProcessRequest


def test_recorder_scoped_and_captures_calls():
    callrec.start()
    callrec.record("classify", "m", "v2", "abc123", {"verdicts": []}, None, 42, None)
    calls = callrec.collect()
    assert len(calls) == 1
    c = calls[0]
    assert c["step"] == "classify" and c["input_hash"] == "abc123" and c["duration_ms"] == 42


def test_run_attaches_ai_calls(monkeypatch):
    monkeypatch.setattr(pipeline, "_guarded",
                        lambda name, text, **k: (callrec.record(name, "m", "v2", "h", {"x": 1}, None, 5, None)
                                                 or {"verdicts": [], "facts": [],
                                                     "summary": "s", "looks_relevant": True, "relevance_reason": "r"}))
    resp = run(ProcessRequest(message_id="1", email_from="a", email_subject="s", email_body="took drug, rash", pdfs=[]))
    steps = [c.step for c in resp.ai_calls]
    assert "classify" in steps
    assert all(c.input_hash for c in resp.ai_calls)
