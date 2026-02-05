import discord
import json
import logging
import asyncio
from datetime import datetime, timedelta

class StantonTimesReactionMonitor:
    def __init__(self, config_path, state_path):
        # Discord client setup
        intents = discord.Intents.default()
        intents.message_content = True
        intents.reactions = True
        self.client = discord.Client(intents=intents)

        # Load configuration
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        # Load state
        with open(state_path, 'r') as f:
            self.state = json.load(f)
        
        # Logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - Reaction Monitor - %(levelname)s - %(message)s',
            filename='/Users/zachgonser/clawd/projects/stanton-times/logs/reaction_monitor.log'
        )
        self.logger = logging.getLogger(__name__)

        # Monitoring parameters
        self.verification_channel_id = int(self.config['discord']['verification_channel_id'])
        self.monitoring_interval = 300  # 5 minutes
        self.pending_stories_max_age = timedelta(hours=24)  # Stories older than 24 hours get auto-rejected

    async def monitor_pending_stories(self):
        """
        Continuously monitor pending stories and their reactions
        """
        while True:
            try:
                await self.check_pending_stories()
                await asyncio.sleep(self.monitoring_interval)
            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(self.monitoring_interval)

    async def check_pending_stories(self):
        """
        Check all pending stories for reaction status
        """
        channel = self.client.get_channel(self.verification_channel_id)
        if not channel:
            self.logger.error(f"Could not find channel with ID {self.verification_channel_id}")
            return

        current_time = datetime.utcnow()
        
        for story in self.state.get('pending_stories', []):
            if story.get('draft_status') == 'posted_for_review':
                # Find the corresponding message
                try:
                    message = await self.find_story_message(channel, story)
                    if message:
                        await self.process_story_reactions(message, story, current_time)
                except Exception as e:
                    self.logger.error(f"Error processing story {story.get('topic')}: {e}")

        # Save updated state
        self._save_state()

    async def find_story_message(self, channel, story):
        """
        Find the message corresponding to a pending story
        """
        async for message in channel.history(limit=100):
            if message.embeds and message.embeds[0].title == f"🗞️ Stanton Times Draft: {story.get('topic')}":
                return message
        return None

    async def process_story_reactions(self, message, story, current_time):
        """
        Process reactions for a specific story message
        """
        # Check message age
        message_age = current_time - message.created_at

        # Count reactions
        reactions = {
            '✅': 0,
            '❌': 0,
            '🤔': 0
        }

        for reaction in message.reactions:
            if str(reaction.emoji) in reactions:
                reactions[str(reaction.emoji)] = reaction.count - 1  # Subtract bot's own reaction

        # Determine story status
        if reactions['✅'] > reactions['❌']:
            story['draft_status'] = 'approved'
            self.logger.info(f"Story approved by community: {story.get('topic')}")
        elif reactions['❌'] >= reactions['✅']:
            story['draft_status'] = 'rejected'
            self.logger.info(f"Story rejected by community: {story.get('topic')}")
        
        # Auto-reject stories older than 24 hours
        if message_age > self.pending_stories_max_age:
            story['draft_status'] = 'rejected'
            self.logger.info(f"Story auto-rejected due to age: {story.get('topic')}")

    def _save_state(self):
        """
        Save updated state to file
        """
        with open('/Users/zachgonser/clawd/memory/stanton-times/state.json', 'w') as f:
            json.dump(self.state, f, indent=2)

    async def on_ready(self):
        """
        Bot startup routine
        """
        self.logger.info(f'Logged in as {self.client.user} - Reaction Monitor')
        await self.monitor_pending_stories()

    def run(self):
        """
        Start the Discord bot
        """
        self.client.run(self.config['discord']['bot_token'])

def main():
    monitor = StantonTimesReactionMonitor(
        '/Users/zachgonser/clawd/projects/stanton-times/config.json',
        '/Users/zachgonser/clawd/memory/stanton-times/state.json'
    )
    monitor.run()

if __name__ == "__main__":
    main()