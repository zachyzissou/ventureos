import json

import pytest

from src.notify.discord_webhook import DiscordWebhookError, send_webhook_payload, with_wait_param


class _Resp:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise json.JSONDecodeError("no", "", 0)
        return self._payload


def test_with_wait_param_sets_wait_true():
    assert with_wait_param("https://discord.com/api/webhooks/x/y").endswith("wait=true")
    assert "wait=true" in with_wait_param("https://discord.com/api/webhooks/x/y?foo=bar")


def test_send_webhook_payload_returns_message_id(monkeypatch):
    called = {}

    def fake_post(url, json=None):
        called["url"] = url
        called["json"] = json
        return _Resp(200, payload={"id": "123"})

    monkeypatch.setattr("src.notify.discord_webhook.requests.post", fake_post)

    msg_id = send_webhook_payload("https://discord.com/api/webhooks/x/y", {"content": "hi"})
    assert msg_id == "123"
    assert "wait=true" in called["url"]
    assert called["json"]["content"] == "hi"


def test_send_webhook_payload_204_returns_none(monkeypatch):
    monkeypatch.setattr("src.notify.discord_webhook.requests.post", lambda url, json=None: _Resp(204))
    assert send_webhook_payload("https://discord.com/api/webhooks/x/y", {"content": "hi"}) is None


def test_send_webhook_payload_error(monkeypatch):
    monkeypatch.setattr(
        "src.notify.discord_webhook.requests.post",
        lambda url, json=None: _Resp(500, text="boom"),
    )
    with pytest.raises(DiscordWebhookError):
        send_webhook_payload("https://discord.com/api/webhooks/x/y", {"content": "hi"})

