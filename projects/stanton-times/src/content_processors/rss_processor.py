import logging

from src.sources.rss import fetch_rss_entries


class RSSProcessor:
    def __init__(self, feed_url):
        self.feed_url = feed_url
        self.logger = logging.getLogger(__name__)

    def fetch_entries(self):
        """Fetch and process RSS feed entries."""
        try:
            entries = fetch_rss_entries(self.feed_url, logger=self.logger)
            return [self.process_entry(entry) for entry in entries]
        except Exception as e:
            self.logger.error(f"Error processing RSS feed {self.feed_url}: {e}")
            return []

    def process_entry(self, entry):
        """Process individual RSS entry."""
        return {
            "title": entry.get("title", ""),
            "link": entry.get("link", ""),
            "published": entry.get("published", ""),
        }
