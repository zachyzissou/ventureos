import json
import os
from datetime import datetime, timedelta

class ContentCleaner:
    def __init__(self, state_file_path):
        self.state_file_path = state_file_path
        self.load_state()

    def load_state(self):
        with open(self.state_file_path, 'r') as f:
            self.state = json.load(f)

    def cleanup_old_content(self, max_age_days=30):
        current_time = datetime.utcnow()
        
        # Clean up pending stories
        self.state['pending_stories'] = [
            story for story in self.state['pending_stories']
            if (current_time - datetime.fromisoformat(story.get('timestamp', current_time.isoformat()))).days < max_age_days
        ]
        
        # Clean up seen tweet IDs
        for source, tweet_ids in self.state.get('seen_tweet_ids', {}).items():
            self.state['seen_tweet_ids'][source] = tweet_ids[-100:]  # Keep last 100 tweet IDs
        
        # Save updated state
        with open(self.state_file_path, 'w') as f:
            json.dump(self.state, f, indent=2)

    def archive_old_stories(self, archive_path):
        # Move old stories to an archive file
        archived_stories = [
            story for story in self.state['pending_stories']
            if story.get('draft_status') in ['published', 'rejected']
        ]
        
        # Ensure archive directory exists
        os.makedirs(archive_path, exist_ok=True)
        
        # Generate archive filename
        archive_filename = f"stanton_times_archive_{datetime.now().strftime('%Y%m%d')}.json"
        archive_file_path = os.path.join(archive_path, archive_filename)
        
        # Write archived stories
        with open(archive_file_path, 'w') as f:
            json.dump(archived_stories, f, indent=2)

def main():
    cleaner = ContentCleaner('/Users/zachgonser/clawd/memory/stanton-times/state.json')
    cleaner.cleanup_old_content()
    cleaner.archive_old_stories('/Users/zachgonser/clawd/projects/stanton-times/archives')

if __name__ == "__main__":
    main()