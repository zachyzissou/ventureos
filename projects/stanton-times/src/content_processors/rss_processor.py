import feedparser
import logging

class RSSProcessor:
    def __init__(self, feed_url):
        self.feed_url = feed_url
        self.logger = logging.getLogger(__name__)

    def fetch_entries(self):
        """Fetch and process RSS feed entries."""
        try:
            feed = feedparser.parse(self.feed_url)
            return [self.process_entry(entry) for entry in feed.entries]
        except Exception as e:
            self.logger.error(f"Error processing RSS feed {self.feed_url}: {e}")
            return []

    def process_entry(self, entry):
        """Process individual RSS entry."""
        return {
            'title': entry.get('title', ''),
            'link': entry.get('link', ''),
            'published': entry.get('published', '')
        }
