from types import SimpleNamespace

from src.sources.rss import fetch_rss_entries


def test_fetch_rss_entries_normalizes(monkeypatch):
    def fake_parse(url):
        assert url == "https://example.com/feed"
        return SimpleNamespace(
            entries=[
                {
                    "title": "Hello",
                    "link": "https://example.com/hello",
                    "summary": "World",
                    "published": "2026-02-06T00:00:00Z",
                }
            ]
        )

    monkeypatch.setattr("src.sources.rss.feedparser.parse", fake_parse)

    entries = fetch_rss_entries("https://example.com/feed")
    assert entries == [
        {
            "title": "Hello",
            "link": "https://example.com/hello",
            "description": "World",
            "published": "2026-02-06T00:00:00Z",
            "source_type": "rss",
        }
    ]

