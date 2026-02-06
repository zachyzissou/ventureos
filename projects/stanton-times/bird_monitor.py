import subprocess
import json
import logging
from typing import List, Dict, Any, Optional

from src.content_processor import StantonTimesContentProcessor
from src.config import ensure_state_file, get_bird_auth_script, get_config_path, load_config
from src.state.store import save_state


class BirdMonitor:
    def __init__(self, config_path=None, state_file_path=None):
        self.config = load_config()
        self.config_path = config_path or str(get_config_path())
        state_file_path = state_file_path or str(ensure_state_file())
        self.content_processor = StantonTimesContentProcessor(state_file_path, self.config_path)

        self.logger = logging.getLogger(__name__)
        logging.basicConfig(level=logging.INFO)

        # Path to bird-auth.sh script (configurable via STANTON_TIMES_BIRD_AUTH_SCRIPT)
        self.bird_auth_path = get_bird_auth_script()

        # Monitored accounts from config
        raw_accounts = self.config.get('monitored_accounts', [
            'RobertsSpaceInd',
            'starcitizenbot',
            'TheRubenSaurus'
        ])
        self.monitored_accounts = []
        for entry in raw_accounts:
            if isinstance(entry, str):
                self.monitored_accounts.append({"handle": entry})
            elif isinstance(entry, dict) and entry.get("handle"):
                if entry.get("enabled", True):
                    self.monitored_accounts.append(entry)

    def _run_bird_command(self, args: List[str]) -> Optional[str]:
        """
        Run bird command with authentication wrapper
        """
        try:
            full_command = [self.bird_auth_path] + args
            result = subprocess.run(full_command, capture_output=True, text=True)

            if result.returncode != 0:
                self.logger.error(f"Bird command failed: {result.stderr.strip()}")
                return None

            return result.stdout
        except Exception as e:
            self.logger.error(f"Error running bird command: {e}")
            return None

    def _extract_tweets(self, data: Any) -> List[Dict[str, Any]]:
        if data is None:
            return []

        # If the API wraps items in a container
        if isinstance(data, dict):
            for key in ('tweets', 'data', 'items', 'results'):
                if key in data and isinstance(data[key], list):
                    data = data[key]
                    break

        if not isinstance(data, list):
            return []

        tweets = []
        for item in data:
            if not isinstance(item, dict):
                continue

            legacy = item.get('legacy', {}) if isinstance(item.get('legacy'), dict) else {}
            text = legacy.get('full_text') or legacy.get('text') or item.get('full_text') or item.get('text')
            if not text:
                continue

            tweet_id = item.get('id') or item.get('rest_id') or item.get('tweet_id') or legacy.get('id_str')
            created_at = legacy.get('created_at') or item.get('created_at')

            tweets.append({
                'id': str(tweet_id) if tweet_id else None,
                'text': text,
                'created_at': created_at
            })

        return tweets

    def fetch_recent_tweets(self, account: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Fetch recent tweets using bird CLI
        """
        output = self._run_bird_command(["--json", "user-tweets", account, "-n", str(limit)])

        if not output:
            return []

        try:
            data = json.loads(output)
            return self._extract_tweets(data)
        except json.JSONDecodeError:
            # Some outputs may be line-delimited JSON
            tweets: List[Dict[str, Any]] = []
            for line in output.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    tweets.extend(self._extract_tweets(data))
                except json.JSONDecodeError:
                    continue
            return tweets

    def process_tweets(self):
        """
        Process tweets for all monitored accounts and generate drafts
        """
        for account in self.monitored_accounts:
            handle = account.get("handle")
            if not handle:
                continue

            tweets = self.fetch_recent_tweets(handle)
            if not tweets:
                continue

            for tweet in tweets:
                text = tweet.get('text', '').strip()
                if not text or text.startswith('RT '):
                    continue

                tweet_id = tweet.get('id')
                link = f"https://x.com/{handle}/status/{tweet_id}" if tweet_id else ''
                topic = text.split('\n')[0][:80]

                content = {
                    'source': handle,
                    'topic': topic,
                    'description': text,
                    'id': tweet_id or text[:12],
                    'link': link,
                    'published_at': tweet.get('created_at'),
                    'priority': account.get('priority'),
                    'tier': account.get('tier')
                }

                self.content_processor.process_content(content)

                # Track seen tweets to reduce duplicates
                if tweet_id:
                    seen = self.content_processor.state.setdefault('seen_tweet_ids', {}).setdefault(handle, [])
                    if tweet_id not in seen:
                        seen.append(tweet_id)
                        self.content_processor.state['seen_tweet_ids'][handle] = seen[-200:]

            # Persist seen IDs + any new pending stories
            self.content_processor.state = save_state(self.content_processor.state_file_path, self.content_processor.state)

        self.logger.info("Bird monitor run complete")


def main():
    monitor = BirdMonitor()
    monitor.process_tweets()


if __name__ == "__main__":
    main()
