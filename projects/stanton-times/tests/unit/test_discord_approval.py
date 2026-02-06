from src.utils.discord_approval import APPROVAL_EMOJIS, build_approval_embed, send_approval_webhook


def test_build_approval_embed_includes_story_id_and_link():
    story = {
        "topic": "Test",
        "tweet_draft": "Hello",
        "content_score": 0.9,
        "source": "RSI Comm-Link",
        "link": "https://example.com/x",
        "story_id": "abc123",
    }
    embed = build_approval_embed(story)
    assert "Stanton Times Draft" in embed["title"]
    field_names = [f["name"] for f in embed["fields"]]
    assert "Link" in field_names
    assert "Story ID" in field_names


def test_send_approval_webhook_routes_through_notify(monkeypatch):
    calls = {"send": 0, "react": 0}

    def fake_load_config():
        return {
            "discord": {
                "webhook_url": "https://discord.com/api/webhooks/x/y",
                "approval_mention": "@here",
                "channel_id": "1",
                "bot_token": "t",
            }
        }

    def fake_send(webhook_url, payload):
        calls["send"] += 1
        assert webhook_url.startswith("https://discord.com/api/webhooks/")
        assert payload["content"] == "@here"
        assert payload["embeds"]
        return "999"

    def fake_add_reactions(*, message_id, channel_id, bot_token, emojis):
        calls["react"] += 1
        assert message_id == "999"
        assert channel_id == "1"
        assert bot_token == "t"
        assert list(emojis) == list(APPROVAL_EMOJIS.values())

    monkeypatch.setattr("src.utils.discord_approval.load_config", fake_load_config)
    monkeypatch.setattr("src.utils.discord_approval.send_webhook_payload", fake_send)
    monkeypatch.setattr("src.utils.discord_approval.add_reactions", fake_add_reactions)

    story = {"topic": "Test", "tweet_draft": "Hello", "content_score": 0.8, "source": "RSI"}
    msg_id = send_approval_webhook(story)
    assert msg_id == "999"
    assert calls["send"] == 1
    assert calls["react"] == 1

