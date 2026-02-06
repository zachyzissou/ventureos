#!/usr/bin/env python3
import os
import json
import logging
import hashlib
import sys
from pathlib import Path
from datetime import datetime, timedelta
import requests
from bs4 import BeautifulSoup
from typing import Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import ensure_state_file, get_config_path, get_log_path, load_config
from src.sources.rss import fetch_rss_entries
from src.state.store import StateValidationError, load_state, save_state
from src.utils.discord_approval import send_approval_webhook
from src.content_processor import StantonTimesContentProcessor

class AdvancedSourceMonitor:
    def __init__(self, config_path: str = None):
        # Logging setup
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            filename=get_log_path('source_monitor.log')
        )
        self.logger = logging.getLogger(__name__)

        # Load configuration
        self.config_path = config_path or str(get_config_path())
        self.load_config()

        # State management
        self.state_file = str(ensure_state_file())
        self.state = self._load_state()
        self.content_processor = StantonTimesContentProcessor(self.state_file, self.config_path)

    def load_config(self):
        """
        Load and validate configuration
        """
        try:
            self.config = load_config()
        except (FileNotFoundError, json.JSONDecodeError) as e:
            self.logger.error(f"Config load error: {e}")
            self.config = {
                'sources': {
                    'RSI Comm-Link': {
                        'type': 'rss',
                        'url': 'https://robertsspaceindustries.com/comm-link/rss',
                        'priority': 'P0',
                        'bypass_keyword_filter': True
                    },
                    'RSI Patch Notes': {
                        'type': 'rss',
                        'url': 'https://robertsspaceindustries.com/comm-link/rss',
                        'priority': 'P0',
                        'include_keywords': ['patch notes', 'ptu', 'hotfix', 'alpha', 'live']
                    },
                    'Star Citizen (YouTube)': {
                        'type': 'rss',
                        'url': 'https://www.youtube.com/feeds/videos.xml?channel_id=UCTeLqJq1mXUX5WWoNXLmOIA',
                        'priority': 'P0',
                        'bypass_keyword_filter': True
                    },
                    'StarCitizenTools News': {
                        'type': 'rss',
                        'url': 'https://www.starcitizen.tools/news/rss',
                        'priority': 'P1'
                    }
                }
            }
            self._save_config()

        # Normalize sources if missing or malformed
        sources = self.config.get('sources')
        if not isinstance(sources, dict) or not sources:
            self.logger.warning("Sources missing; using defaults")
            self.config['sources'] = {
                'RSI Comm-Link': {
                    'type': 'rss',
                    'url': 'https://robertsspaceindustries.com/comm-link/rss',
                    'priority': 'P0',
                    'bypass_keyword_filter': True
                },
                'RSI Patch Notes': {
                    'type': 'rss',
                    'url': 'https://robertsspaceindustries.com/comm-link/rss',
                    'priority': 'P0',
                    'include_keywords': ['patch notes', 'ptu', 'hotfix', 'alpha', 'live']
                },
                'Star Citizen (YouTube)': {
                    'type': 'rss',
                    'url': 'https://www.youtube.com/feeds/videos.xml?channel_id=UCTeLqJq1mXUX5WWoNXLmOIA',
                    'priority': 'P0',
                    'bypass_keyword_filter': True
                },
                'StarCitizenTools News': {
                    'type': 'rss',
                    'url': 'https://www.starcitizen.tools/news/rss',
                    'priority': 'P1'
                }
            }

    def _load_state(self) -> Dict:
        """
        Load or initialize state file
        """
        try:
            return load_state(self.state_file)
        except (json.JSONDecodeError, StateValidationError, FileNotFoundError):
            # Fall back to a minimal safe structure; validation will fill defaults on save.
            return {
                "last_checked": {},
                "pending_stories": [],
                "processed_sources": {},
                "content_intelligence": {},
                "seen_tweet_ids": {},
            }

    def _save_state(self):
        """
        Save current state to file
        """
        self.state = save_state(self.state_file, self.state)

    def _save_config(self):
        """
        Save current config to file
        """
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=2)

    def fetch_source_content(self, source_name: str, source_config: Dict) -> List[Dict]:
        """
        Fetch content based on source type
        """
        self.logger.info(f"Fetching content from {source_name}")
        try:
            if source_config['type'] == 'rss':
                return self._fetch_rss(source_config['url'])
            else:
                self.logger.warning(f"Unsupported source type: {source_config['type']}")
                return []
        except Exception as e:
            self.logger.error(f"Error fetching content from {source_name}: {e}")
            return []

    def _fetch_rss(self, url: str) -> List[Dict]:
        """
        Fetch and parse RSS feed
        """
        return fetch_rss_entries(url, logger=self.logger)

    def fetch_sources(self) -> List[Dict]:
        """
        Return configured sources as a list for compatibility with older callers.
        """
        sources = self.config.get('sources', {})
        if isinstance(sources, dict):
            return [{"name": name, **cfg} for name, cfg in sources.items()]
        if isinstance(sources, list):
            return sources
        return []

    def filter_content(self, contents: List[Dict], source_config: Optional[Dict] = None) -> List[Dict]:
        """
        Advanced content filtering
        """
        filtered_contents = []
        keywords = {
            'star citizen': 0.7,
            'update': 0.5,
            'patch': 0.6,
            'patch notes': 0.7,
            'ptu': 0.7,
            'hotfix': 0.6,
            'release': 0.6,
            'development': 0.5,
            'roadmap': 0.5,
            'inside star citizen': 0.4,
            'star citizen live': 0.4
        }

        include_keywords = [k.lower() for k in (source_config or {}).get('include_keywords', [])]
        exclude_keywords = [k.lower() for k in (source_config or {}).get('exclude_keywords', [])]
        bypass_filter = bool((source_config or {}).get('bypass_keyword_filter'))

        for content in contents:
            title = content.get('title', '').lower()
            description = content.get('description', '').lower()
            haystack = f"{title} {description}"

            if exclude_keywords and any(k in haystack for k in exclude_keywords):
                continue

            if include_keywords and not any(k in haystack for k in include_keywords):
                continue

            if bypass_filter:
                content['score'] = content.get('score', 1.0)
                filtered_contents.append(content)
                continue

            # Calculate relevance score
            score = sum(
                keywords.get(keyword.lower(), 0)
                for keyword in keywords
                if keyword.lower() in haystack
            )

            if score > 0.5:  # Configurable relevance threshold
                content['score'] = score
                filtered_contents.append(content)

        return filtered_contents

    def _make_story_id(self, source: str, title: str, timestamp: str, link: str) -> str:
        raw = f"{source}|{title}|{timestamp}|{link}"
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]

    def process_sources(self):
        """
        Process all configured sources
        """
        self.state = self._load_state()
        seen_story_ids = {
            story.get('story_id') for story in self.state.get('pending_stories', []) if story.get('story_id')
        }
        last_checked_updates = {}

        for source_name, source_config in self.config.get('sources', {}).items():
            try:
                # Fetch content
                contents = self.fetch_source_content(source_name, source_config)

                # Filter content
                filtered_contents = self.filter_content(contents, source_config)

                # Use content processor to decide draft vs skip
                for content in filtered_contents:
                    story_id = self._make_story_id(
                        source_name,
                        content.get('title', ''),
                        content.get('published', ''),
                        content.get('link', '')
                    )

                    story_probe = {
                        'story_id': story_id,
                        'source': source_name,
                        'title': content.get('title', '')
                    }

                    if story_id in seen_story_ids or self._is_duplicate(story_probe):
                        continue

                    payload = {
                        'source': source_name,
                        'topic': content.get('title', 'Untitled'),
                        'description': content.get('description', ''),
                        'link': content.get('link', ''),
                        'published_at': content.get('published'),
                        'id': story_id,
                        'priority': source_config.get('priority', 'P2'),
                        'tier': source_config.get('tier')
                    }

                    result = self.content_processor.process_content(payload)
                    if result.get('status') == 'draft_ready':
                        seen_story_ids.add(story_id)
                        self.logger.info(f"Draft created from {source_name}: {payload['topic']}")

                # Update last checked timestamp
                last_checked_updates[source_name] = datetime.now().isoformat()

            except Exception as e:
                self.logger.error(f"Error processing source {source_name}: {e}")

        # Reload to merge pending_stories written by content_processor
        self.state = self._load_state()
        self.state.setdefault('last_checked', {}).update(last_checked_updates)
        self._save_state()

    def _is_duplicate(self, story: Dict) -> bool:
        """
        Check if story is a duplicate of existing pending stories
        """
        for existing_story in self.state.get('pending_stories', []):
            if story.get('story_id') and existing_story.get('story_id') == story.get('story_id'):
                return True
            if (existing_story.get('title') == story.get('title') and 
                existing_story.get('source') == story.get('source')):
                return True
        return False

    def notify_discord(self):
        """
        Send notifications to Discord for new pending stories
        """
        # Reload to pick up the latest pending stories written by content_processor
        self.state = self._load_state()

        webhook_url = self.config.get('discord', {}).get('webhook_url')
        if not webhook_url:
            self.logger.warning("No Discord webhook URL configured")
            return

        for story in self.state['pending_stories']:
            if story['draft_status'] == 'needs_review' and not story.get('discord_message_id'):
                try:
                    message_id = send_approval_webhook(story, webhook_url=webhook_url)
                    if message_id:
                        story['discord_message_id'] = message_id
                        story['discord_message_ts'] = datetime.utcnow().isoformat()
                    story['draft_status'] = 'posted_for_review'
                except Exception as e:
                    self.logger.error(f"Discord notification error: {e}")

        self._save_state()

# Backwards compatibility: older code/tests import `SourceMonitor`.
SourceMonitor = AdvancedSourceMonitor

def main():
    monitor = AdvancedSourceMonitor()
    
    # Process sources and notify
    monitor.process_sources()
    monitor.notify_discord()

if __name__ == "__main__":
    main()
