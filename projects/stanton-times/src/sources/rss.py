from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import feedparser


def fetch_rss_entries(url: str, logger: Optional[logging.Logger] = None) -> List[Dict[str, Any]]:
    """
    Fetch and normalize RSS/Atom entries via feedparser.

    Callers should treat the returned dicts as "raw items" suitable for further
    filtering/scoring.
    """
    logger = logger or logging.getLogger(__name__)
    logger.info("Parsing RSS feed: %s", url)

    feed = feedparser.parse(url)
    entries = getattr(feed, "entries", None) or []

    if not entries:
        logger.warning("No entries found in RSS feed: %s", url)

    normalized: List[Dict[str, Any]] = []
    for entry in entries:
        published = (
            entry.get("published")
            or entry.get("updated")
            or datetime.utcnow().isoformat()
        )
        normalized.append(
            {
                "title": entry.get("title", "Untitled"),
                "link": entry.get("link", ""),
                "description": entry.get("summary") or entry.get("description") or "",
                "published": published,
                "source_type": "rss",
            }
        )

    return normalized

