import json
import logging
import re
import subprocess
from typing import Optional

from src.content_processor import StantonTimesContentProcessor
from ledger import StantonTimesLedger
from src.config import (
    ensure_state_file,
    get_bird_auth_script,
    get_config_path,
    get_log_path,
    get_send_embed_script,
    load_config,
)
from src.state.store import save_state


class TweetPublisher:
    def __init__(self, config_path=None, state_file_path=None):
        self.config = load_config()
        config_path = config_path or str(get_config_path())

        state_file_path = state_file_path or str(ensure_state_file())
        self.content_processor = StantonTimesContentProcessor(state_file_path, config_path)
        self.ledger = StantonTimesLedger()
        logging.basicConfig(
            level=logging.INFO,
            format=(self.config.get("logging", {}) or {}).get(
                "format",
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            ),
            filename=get_log_path("tweet_publisher.log"),
        )
        self.logger = logging.getLogger(__name__)
        self.bird_auth_script = get_bird_auth_script()
        self.send_embed_script = get_send_embed_script()

    def _extract_tweet_id(self, output: str) -> Optional[str]:
        output = output.strip()
        if not output:
            return None

        # Try JSON parse first
        try:
            data = json.loads(output)
            if isinstance(data, dict):
                if isinstance(data.get("data"), dict) and data["data"].get("id"):
                    return str(data["data"]["id"])
                if data.get("id"):
                    return str(data["id"])
                if isinstance(data.get("tweet"), dict) and data["tweet"].get("id"):
                    return str(data["tweet"]["id"])
                if data.get("url"):
                    match = re.search(r"/status/(\d+)", data["url"])
                    if match:
                        return match.group(1)
            elif isinstance(data, list) and data:
                first = data[0]
                if isinstance(first, dict):
                    if first.get("id"):
                        return str(first["id"])
                    if isinstance(first.get("data"), dict) and first["data"].get("id"):
                        return str(first["data"]["id"])
        except json.JSONDecodeError:
            pass

        # Fallback: regex search for URL or numeric ID
        match = re.search(r"/status/(\d+)", output)
        if match:
            return match.group(1)

        match = re.search(r"\b(\d{15,20})\b", output)
        if match:
            return match.group(1)

        return None

    def _post_with_bird(self, tweet_text: str) -> Optional[str]:
        cmd = [self.bird_auth_script, "--json", "tweet", tweet_text]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        except FileNotFoundError:
            self.logger.error(
                "bird-auth script not found (%s). Set STANTON_TIMES_BIRD_AUTH_SCRIPT or install bird-auth.sh on PATH.",
                self.bird_auth_script,
            )
            return None
        except Exception as e:
            self.logger.error(f"bird tweet failed: {e}")
            return None

        if result.returncode != 0:
            self.logger.error(f"bird tweet error: {result.stderr.strip()}")
            return None

        tweet_id = self._extract_tweet_id(result.stdout)
        if not tweet_id:
            self.logger.warning("Tweet posted but ID not detected. Output: %s", result.stdout.strip())
        return tweet_id

    def _send_publish_embed(self, story: dict, tweet_id: str):
        title = story.get('topic') or story.get('title') or 'Tweet published'
        tweet_url = f"https://x.com/TheStantonTimes/status/{tweet_id}"
        description = f"✅ **Published**\n{tweet_url}"
        cmd = [
            "node",
            self.send_embed_script,
            "--title",
            f"Published: {title}",
            "--description",
            description
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except Exception as e:
            self.logger.error(f"Failed to send publish embed: {e}")

    def publish_pending_tweets(self):
        pending_stories = self.content_processor.state.get('pending_stories', [])

        for story in pending_stories:
            if story.get('draft_status') == 'approved':
                try:
                    if story.get('is_test'):
                        self.logger.info("Skipping test story publish: %s", story.get('topic') or story.get('title'))
                        story['draft_status'] = 'test_skipped'
                        continue

                    tweet_text = story.get('tweet_draft') or story.get('simulated_draft')

                    if not tweet_text:
                        self.logger.warning(
                            f"Approved story missing tweet draft: {story.get('topic') or story.get('title')}"
                        )
                        continue

                    # Ensure tweet is within 280 character limit
                    if len(tweet_text) > 280:
                        tweet_text = tweet_text[:277] + '...'

                    tweet_id = self._post_with_bird(tweet_text)
                    if not tweet_id:
                        self.logger.error("Failed to publish tweet via bird.")
                        continue

                    self.logger.info(f"Published tweet: {tweet_text}")

                    # Update story status
                    story['draft_status'] = 'published'
                    story['tweet_id'] = tweet_id

                    # Mark ledger
                    if story.get('ledger_item_id') and story.get('cluster_id'):
                        try:
                            self.ledger.mark_published(story['ledger_item_id'], story['cluster_id'], tweet_id)
                        except Exception as e:
                            self.logger.error(f"Failed to update ledger publish status: {e}")

                    # Send confirmation embed
                    self._send_publish_embed(story, tweet_id)

                except Exception as e:
                    self.logger.error(f"Failed to publish tweet: {e}")

        # Save updated state
        self.content_processor.state = save_state(self.content_processor.state_file_path, self.content_processor.state)


def main():
    publisher = TweetPublisher()
    publisher.publish_pending_tweets()


if __name__ == "__main__":
    main()
