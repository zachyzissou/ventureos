import json
import logging
from datetime import datetime

from src.content_processor import StantonTimesContentProcessor
from src.config import ensure_state_file, get_config_path, get_log_path, load_config
from src.state.store import save_state
from src.utils.discord_approval import send_approval_webhook

class StantonTimesDiscordNotifier:
    def __init__(self, config_path=None, state_file_path=None):
        # Load configuration
        self.config = load_config()
        self.config_path = config_path or str(get_config_path())
        
        # Logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            filename=get_log_path('discord_notifier.log')
        )
        self.logger = logging.getLogger(__name__)

        # Content processor
        state_file_path = state_file_path or str(ensure_state_file())
        self.content_processor = StantonTimesContentProcessor(state_file_path, self.config_path)

        # Webhook setup
        self.webhook_url = self.config.get('discord', {}).get('webhook_url', '').strip()
        if not self.webhook_url:
            raise ValueError('Discord webhook URL not configured (config or env).')

    def send_webhook_message(self, story):
        """
        Send story draft to Discord via webhook
        """
        try:
            message_id = send_approval_webhook(story, webhook_url=self.webhook_url)

            if message_id:
                story['discord_message_id'] = message_id
                story['discord_message_ts'] = datetime.utcnow().isoformat()

            self.logger.info(f"Successfully sent story draft for {story.get('topic')}")

        except Exception as e:
            self.logger.error(f"Error sending webhook: {str(e)}")

    def process_pending_stories(self):
        """
        Process and send pending stories
        """
        pending_stories = self.content_processor.state.get('pending_stories', [])
        
        for story in pending_stories:
            if story.get('draft_status') == 'needs_review' and not story.get('discord_message_id'):
                self.send_webhook_message(story)
                story['draft_status'] = 'posted_for_review'

        # Save updated state
        self.content_processor.state = save_state(self.content_processor.state_file_path, self.content_processor.state)

def main():
    notifier = StantonTimesDiscordNotifier()
    notifier.process_pending_stories()

if __name__ == "__main__":
    main()
