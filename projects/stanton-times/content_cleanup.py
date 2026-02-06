import json
import os
from datetime import datetime, timedelta, timezone

from src.config import PROJECT_ROOT, ensure_state_file
from src.state.store import load_state, save_state

class ContentCleaner:
    def __init__(self, state_file_path=None):
        self.state_file_path = state_file_path or str(ensure_state_file())
        self.load_state()

    def load_state(self):
        self.state = load_state(self.state_file_path)

    def _story_timestamp(self, story):
        for key in ("discord_message_ts", "created_at", "timestamp"):
            value = story.get(key)
            if not value:
                continue
            try:
                cleaned = value.replace("Z", "+00:00") if isinstance(value, str) else value
                dt = datetime.fromisoformat(cleaned)
                if dt.tzinfo:
                    dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
                return dt
            except Exception:
                continue
        return None

    def cleanup_old_content(self, max_age_days=30):
        current_time = datetime.utcnow()

        # Clean up pending stories (generic max age)
        pruned = []
        for story in self.state.get('pending_stories', []):
            ts = self._story_timestamp(story) or current_time
            if (current_time - ts).days < max_age_days:
                pruned.append(story)
        self.state['pending_stories'] = pruned

        # Clean up seen tweet IDs
        for source, tweet_ids in self.state.get('seen_tweet_ids', {}).items():
            self.state['seen_tweet_ids'][source] = tweet_ids[-100:]  # Keep last 100 tweet IDs

        # Save updated state
        self.state = save_state(self.state_file_path, self.state)

    def archive_old_stories(self, archive_path, rejected_hours=24, published_hours=72):
        # Move old stories to an archive file and remove from pending
        current_time = datetime.utcnow()
        archived_stories = []
        remaining = []

        for story in self.state.get('pending_stories', []):
            status = story.get('draft_status')
            ts = self._story_timestamp(story) or current_time
            age_hours = (current_time - ts).total_seconds() / 3600

            should_archive = False
            if status == 'rejected' and age_hours >= rejected_hours:
                should_archive = True
            elif status == 'published' and age_hours >= published_hours:
                should_archive = True
            elif status == 'test_skipped':
                should_archive = True

            if should_archive:
                archived_stories.append(story)
            else:
                remaining.append(story)

        if archived_stories:
            # Ensure archive directory exists
            os.makedirs(archive_path, exist_ok=True)

            # Generate archive filename
            archive_filename = f"stanton_times_archive_{datetime.now().strftime('%Y%m%d')}.json"
            archive_file_path = os.path.join(archive_path, archive_filename)

            existing = []
            if os.path.exists(archive_file_path):
                try:
                    with open(archive_file_path, 'r') as f:
                        existing = json.load(f)
                except Exception:
                    existing = []

            with open(archive_file_path, 'w') as f:
                json.dump(existing + archived_stories, f, indent=2)

        self.state['pending_stories'] = remaining

        # Save updated state
        self.state = save_state(self.state_file_path, self.state)

def main():
    cleaner = ContentCleaner()
    cleaner.cleanup_old_content()
    cleaner.archive_old_stories(str(PROJECT_ROOT / 'archives'))

if __name__ == "__main__":
    main()
