#!/usr/bin/env python3
import os
import json
import logging
from datetime import datetime, timedelta
import requests
import feedparser
from bs4 import BeautifulSoup
from typing import Dict, List, Optional

class AdvancedSourceMonitor:
    def __init__(self, config_path: str):
        # Logging setup
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            filename='/Users/zachgonser/clawd/projects/stanton-times/logs/source_monitor.log'
        )
        self.logger = logging.getLogger(__name__)

        # Load configuration
        self.config_path = config_path
        self.load_config()

        # State management
        self.state_file = '/Users/zachgonser/clawd/memory/stanton-times/state.json'
        self.state = self._load_state()

    def load_config(self):
        """
        Load and validate configuration
        """
        try:
            with open(self.config_path, 'r') as f:
                self.config = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            self.logger.error(f"Config load error: {e}")
            self.config = {
                'sources': {
                    'RobertsSpaceInd': {
                        'type': 'rss',
                        'url': 'https://robertsspaceindustries.com/comm-link/rss',
                        'priority': 'P0'
                    },
                    'StarCitizenTracker': {
                        'type': 'rss',
                        'url': 'https://www.starcitizen.tools/news/rss',
                        'priority': 'P1'
                    }
                }
            }
            self._save_config()

    def _load_state(self) -> Dict:
        """
        Load or initialize state file
        """
        try:
            with open(self.state_file, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {
                'last_checked': {},
                'pending_stories': [],
                'processed_sources': {}
            }

    def _save_state(self):
        """
        Save current state to file
        """
        with open(self.state_file, 'w') as f:
            json.dump(self.state, f, indent=2)

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
        self.logger.info(f"Parsing RSS feed: {url}")
        feed = feedparser.parse(url)
        
        if not feed.entries:
            self.logger.warning(f"No entries found in RSS feed: {url}")
        
        return [
            {
                'title': entry.get('title', 'Untitled'),
                'link': entry.get('link', ''),
                'description': entry.get('summary', ''),
                'published': entry.get('published', datetime.now().isoformat()),
                'source_type': 'rss'
            } for entry in feed.entries
        ]

    def filter_content(self, contents: List[Dict]) -> List[Dict]:
        """
        Advanced content filtering
        """
        filtered_contents = []
        keywords = {
            'star citizen': 0.7,
            'update': 0.5,
            'patch': 0.6,
            'release': 0.6,
            'development': 0.5
        }

        for content in contents:
            # Calculate relevance score
            score = sum(
                keywords.get(keyword.lower(), 0) 
                for keyword in keywords 
                if keyword.lower() in content['title'].lower() or 
                   keyword.lower() in content['description'].lower()
            )

            if score > 0.5:  # Configurable relevance threshold
                content['score'] = score
                filtered_contents.append(content)

        return filtered_contents

    def process_sources(self):
        """
        Process all configured sources
        """
        for source_name, source_config in self.config['sources'].items():
            try:
                # Fetch content
                contents = self.fetch_source_content(source_name, source_config)
                
                # Filter content
                filtered_contents = self.filter_content(contents)
                
                # Add to pending stories
                for content in filtered_contents:
                    story = {
                        'source': source_name,
                        'priority': source_config.get('priority', 'P2'),
                        'title': content['title'],
                        'description': content['description'],
                        'link': content['link'],
                        'score': content.get('score', 0.5),
                        'timestamp': content['published'],
                        'draft_status': 'needs_review'
                    }
                    
                    # Avoid duplicates
                    if not self._is_duplicate(story):
                        self.state['pending_stories'].append(story)
                        self.logger.info(f"Added story from {source_name}: {story['title']}")

                # Update last checked timestamp
                self.state['last_checked'][source_name] = datetime.now().isoformat()

            except Exception as e:
                self.logger.error(f"Error processing source {source_name}: {e}")

        # Save updated state
        self._save_state()

    def _is_duplicate(self, story: Dict) -> bool:
        """
        Check if story is a duplicate of existing pending stories
        """
        for existing_story in self.state['pending_stories']:
            if (existing_story['title'] == story['title'] and 
                existing_story['source'] == story['source']):
                return True
        return False

    def notify_discord(self):
        """
        Send notifications to Discord for new pending stories
        """
        webhook_url = self.config.get('discord', {}).get('webhook_url')
        if not webhook_url:
            self.logger.warning("No Discord webhook URL configured")
            return

        for story in self.state['pending_stories']:
            if story['draft_status'] == 'needs_review':
                payload = {
                    'embeds': [{
                        'title': story['title'],
                        'description': story['description'][:250] + '...',
                        'color': 5793266,  # Blurple
                        'fields': [
                            {'name': 'Source', 'value': story['source'], 'inline': True},
                            {'name': 'Relevance Score', 'value': f"{story['score']:.2f}", 'inline': True}
                        ],
                        'url': story['link']
                    }]
                }

                try:
                    response = requests.post(webhook_url, json=payload)
                    if response.status_code in [200, 204]:
                        story['draft_status'] = 'posted_for_review'
                    else:
                        self.logger.error(f"Failed to send Discord notification: {response.text}")
                except Exception as e:
                    self.logger.error(f"Discord notification error: {e}")

        self._save_state()

def main():
    config_path = '/Users/zachgonser/clawd/projects/stanton-times/config.json'
    monitor = AdvancedSourceMonitor(config_path)
    
    # Process sources and notify
    monitor.process_sources()
    monitor.notify_discord()

if __name__ == "__main__":
    main()