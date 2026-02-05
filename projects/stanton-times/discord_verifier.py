import json
import logging
import requests
from content_processor import StantonTimesContentProcessor

class StantonTimesDiscordNotifier:
    def __init__(self, config_path, state_file_path):
        # Load configuration
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        # Logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            filename='/Users/zachgonser/clawd/projects/stanton-times/logs/discord_notifier.log'
        )
        self.logger = logging.getLogger(__name__)

        # Content processor
        self.content_processor = StantonTimesContentProcessor(state_file_path)

        # Webhook setup
        with open('/Users/zachgonser/.credentials/stanton_times_discord_webhook', 'r') as f:
            self.webhook_url = f.read().strip()

    def create_embed(self, story):
        """
        Create a Discord embed for a story draft
        """
        # Embed colors
        colors = {
            'info': 5793266,     # Blurple
            'success': 5763719,  # Green
            'error': 15548997,   # Red
            'warning': 16775424  # Yellow
        }

        # Create embed payload
        embed = {
            'title': f"🗞️ Stanton Times Draft: {story.get('topic', 'Untitled')}",
            'description': story.get('simulated_draft', 'No draft available'),
            'color': colors['info'],
            'fields': [
                {
                    'name': 'Source',
                    'value': story.get('source', 'Unknown'),
                    'inline': True
                },
                {
                    'name': 'Content Score',
                    'value': f"{story.get('score', 0):.2f}",
                    'inline': True
                }
            ],
            'footer': {
                'text': "The Stanton Times - Bringing the 'verse to you"
            }
        }

        return embed

    def send_webhook_message(self, story):
        """
        Send story draft to Discord via webhook
        """
        try:
            embed = self.create_embed(story)
            
            # Webhook payload
            payload = {
                'embeds': [embed],
                'components': [
                    {
                        'type': 1,
                        'components': [
                            {
                                'type': 2,
                                'label': 'Approve',
                                'style': 3,
                                'custom_id': 'approve_story'
                            },
                            {
                                'type': 2,
                                'label': 'Reject',
                                'style': 4,
                                'custom_id': 'reject_story'
                            },
                            {
                                'type': 2,
                                'label': 'Review',
                                'style': 2,
                                'custom_id': 'review_story'
                            }
                        ]
                    }
                ]
            }

            # Send webhook
            response = requests.post(self.webhook_url, json=payload)
            
            if response.status_code in [200, 204]:
                self.logger.info(f"Successfully sent story draft for {story.get('topic')}")
            else:
                self.logger.error(f"Failed to send webhook: {response.text}")

        except Exception as e:
            self.logger.error(f"Error sending webhook: {str(e)}")

    def process_pending_stories(self):
        """
        Process and send pending stories
        """
        pending_stories = self.content_processor.state.get('pending_stories', [])
        
        for story in pending_stories:
            if story.get('draft_status') == 'needs_review':
                self.send_webhook_message(story)
                story['draft_status'] = 'posted_for_review'

        # Save updated state
        with open(self.content_processor.state_file_path, 'w') as f:
            json.dump(self.content_processor.state, f, indent=2)

def main():
    notifier = StantonTimesDiscordNotifier(
        '/Users/zachgonser/clawd/projects/stanton-times/config.json',
        '/Users/zachgonser/clawd/memory/stanton-times/state.json'
    )
    notifier.process_pending_stories()

if __name__ == "__main__":
    main()