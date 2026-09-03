"""Strict-JSON helper tests with a stubbed OpenAI client. Backs TODO.md EC7."""
import pytest

from app import llm


class _Message:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Message(content)


class _Resp:
    def __init__(self, content):
        self.choices = [_Choice(content)]


class _FakeCompletions:
    def __init__(self, replies):
        self._replies = list(replies)
        self.calls = 0

    def create(self, **_):
        self.calls += 1
        return _Resp(self._replies.pop(0))


class _FakeClient:
    def __init__(self, replies):
        self.chat = type("Chat", (), {"completions": _FakeCompletions(replies)})()


def _use(monkeypatch, replies):
    fake = _FakeClient(replies)
    monkeypatch.setattr(llm, "_client", fake)
    monkeypatch.setattr(llm, "client", lambda: fake)
    return fake


def test_ask_json_parses_object(monkeypatch):
    _use(monkeypatch, ['{"bucket": "ICSR", "confidence": 0.9}'])
    assert llm.ask_json("sys", "user") == {"bucket": "ICSR", "confidence": 0.9}


def test_ask_json_trims_trailing_noise(monkeypatch):
    _use(monkeypatch, ['{"ok": true} trailing words here'])
    assert llm.ask_json("sys", "user") == {"ok": True}


def test_ask_json_retries_then_raises(monkeypatch):
    fake = _use(monkeypatch, ["not json", "still not json"])
    with pytest.raises(ValueError):
        llm.ask_json("sys", "user", retries=1)
    assert fake.chat.completions.calls == 2


def test_image_part_is_data_uri():
    part = llm.image_part("QUJD")
    assert part["type"] == "image_url"
    assert part["image_url"]["url"].startswith("data:image/png;base64,QUJD")
