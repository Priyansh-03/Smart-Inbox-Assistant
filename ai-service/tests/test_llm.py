"""Strict-JSON helper tests with a stubbed Anthropic client. Backs TODO.md EC7."""
import pytest

from app import llm


class _Block:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class _Msg:
    def __init__(self, text):
        self.content = [_Block(text)]


class _FakeMessages:
    def __init__(self, replies):
        self._replies = list(replies)
        self.calls = 0

    def create(self, **_):
        self.calls += 1
        return _Msg(self._replies.pop(0))


class _FakeClient:
    def __init__(self, replies):
        self.messages = _FakeMessages(replies)


def _use(monkeypatch, replies):
    fake = _FakeClient(replies)
    monkeypatch.setattr(llm, "_client", fake)
    monkeypatch.setattr(llm, "client", lambda: fake)
    return fake


def test_ask_json_parses_prefilled_object(monkeypatch):
    _use(monkeypatch, ['"bucket": "ICSR", "confidence": 0.9}'])
    out = llm.ask_json("sys", "user")
    assert out == {"bucket": "ICSR", "confidence": 0.9}


def test_ask_json_trims_trailing_noise(monkeypatch):
    _use(monkeypatch, ['"ok": true} trailing words here'])
    assert llm.ask_json("sys", "user") == {"ok": True}


def test_ask_json_retries_then_raises(monkeypatch):
    fake = _use(monkeypatch, ["not json", "still not json"])
    with pytest.raises(ValueError):
        llm.ask_json("sys", "user", retries=1)
    assert fake.messages.calls == 2
