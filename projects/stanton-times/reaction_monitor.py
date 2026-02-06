import discord
import json
import logging
import asyncio
from datetime import datetime, timedelta

from src.config import ensure_state_file, get_config_path, get_log_path, load_config
from src.state.store import load_state, save_state
from src.utils.approval_decision import decide_draft_status
from ledger import StantonTimesLedger

class StantonTimesReactionMonitor:
    def __init__(self, config_path=None, state_path=None):
        # Discord client setup
        intents = discord.Intents.default()
        intents.message_content = True
        intents.reactions = True
        self.client = discord.Client(intents=intents)

        # Register event handlers
        self.client.event(self.on_ready)
        self.client.event(self.on_raw_reaction_add)
        self.client.event(self.on_raw_reaction_remove)
        self.client.event(self.on_message)

        # Load configuration
        self.config = load_config()
        self.config_path = config_path or str(get_config_path())
        
        # Load state
        state_path = state_path or str(ensure_state_file())
        self.state_path = state_path
        self.state = self._load_state()
        
        # Logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - Reaction Monitor - %(levelname)s - %(message)s',
            filename=get_log_path('reaction_monitor.log')
        )
        self.logger = logging.getLogger(__name__)

        # Monitoring parameters
        self.verification_channel_id = int(self.config['discord']['verification_channel_id'])
        self.monitoring_interval = 900  # 15 minutes (fallback reconciliation)
        self.pending_stories_max_age = timedelta(hours=24)  # Stories older than 24 hours get auto-rejected

        self.ledger = StantonTimesLedger()

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
        # Reload state each cycle to pick up new drafts
        self.state = self._load_state()

        channel = self.client.get_channel(self.verification_channel_id)
        if not channel:
            self.logger.error(f"Could not find channel with ID {self.verification_channel_id}")
            return

        current_time = datetime.utcnow()
        
        for story in self.state.get('pending_stories', []):
            if story.get('draft_status') == 'posted_for_review':
                try:
                    message = await self._get_story_message(channel, story)
                    if message:
                        await self.process_story_reactions(message, story, current_time)
                except Exception as e:
                    self.logger.error(f"Error processing story {story.get('topic') or story.get('title')}: {e}")

        # Save updated state
        self._save_state()

    async def _get_story_message(self, channel, story):
        """
        Find the message corresponding to a pending story
        """
        message_id = story.get('discord_message_id')
        if message_id:
            try:
                return await channel.fetch_message(int(message_id))
            except Exception:
                self.logger.warning(f"Could not fetch message {message_id}, falling back to search.")

        title = story.get('topic') or story.get('title') or ''
        async for message in channel.history(limit=200):
            if message.embeds and message.embeds[0].title == f"🗞️ Stanton Times Draft: {title}":
                return message
        return None

    async def _handle_reaction_event(self, channel_id: int, message_id: int):
        # Reload state for the latest story list
        self.state = self._load_state()
        story = next(
            (s for s in self.state.get('pending_stories', [])
             if str(s.get('discord_message_id')) == str(message_id)),
            None
        )
        if not story or story.get('draft_status') not in ('posted_for_review', 'edit_requested'):
            return

        channel = self.client.get_channel(channel_id)
        if channel is None:
            try:
                channel = await self.client.fetch_channel(channel_id)
            except Exception as e:
                self.logger.error(f"Unable to fetch channel {channel_id}: {e}")
                return

        try:
            message = await channel.fetch_message(message_id)
        except Exception as e:
            self.logger.error(f"Unable to fetch message {message_id}: {e}")
            return

        prev_status = story.get('draft_status')
        await self.process_story_reactions(message, story, datetime.utcnow())
        if story.get('draft_status') != prev_status and story.get('draft_status') == 'edit_requested':
            try:
                await self._post_edit_request(channel, story)
            except Exception as e:
                self.logger.error(f"Failed to post edit request: {e}")

        self._save_state()

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
            '🤔': 0,
            '✏️': 0
        }

        for reaction in message.reactions:
            if str(reaction.emoji) in reactions:
                reactions[str(reaction.emoji)] = max(reaction.count - 1, 0)  # Subtract bot's own reaction

        title = story.get('topic') or story.get('title') or 'Untitled'

        # Auto-reject stories older than 24 hours
        if message_age > self.pending_stories_max_age:
            story['draft_status'] = 'rejected'
            self.logger.info(f"Story auto-rejected due to age: {title}")
            self._update_ledger_status(story, 'rejected')
            return

        next_status = decide_draft_status(
            reaction_counts=reactions,
            message_age=message_age,
            max_age=self.pending_stories_max_age,
        )
        if not next_status:
            return

        story['draft_status'] = next_status
        if next_status == 'edit_requested':
            self.logger.info(f"Story marked for edits: {title}")
        elif next_status == 'approved':
            self.logger.info(f"Story approved by community: {title}")
        elif next_status == 'rejected':
            self.logger.info(f"Story rejected by community: {title}")
        elif next_status == 'hold':
            self.logger.info(f"Story held for review: {title}")
        self._update_ledger_status(story, next_status)

    def _load_state(self):
        return load_state(self.state_path)

    async def _post_edit_request(self, channel, story):
        title = story.get('topic') or story.get('title') or 'Untitled'
        story_id = story.get('story_id', 'unknown')
        current_draft = story.get('tweet_draft') or story.get('simulated_draft') or ''
        message = (
            f"✏️ **Edit requested** for: **{title}**\n"
            f"Reply in this channel with:\n"
            f"`EDIT: <new tweet text>`\n"
            f"Story ID: `{story_id}`\n"
        )
        if current_draft:
            trimmed = current_draft if len(current_draft) <= 280 else current_draft[:277] + '...'
            message += f"Current draft: {trimmed}"
        await channel.send(message)

    def _update_ledger_status(self, story, status: str):
        item_id = story.get('ledger_item_id')
        if not item_id:
            return
        try:
            self.ledger.mark_status(int(item_id), status)
        except Exception as e:
            self.logger.error(f"Failed to update ledger status: {e}")

    def _save_state(self):
        """
        Save updated state to file
        """
        self.state = save_state(self.state_path, self.state)

    async def on_ready(self):
        """
        Bot startup routine
        """
        self.logger.info(f'Logged in as {self.client.user} - Reaction Monitor')
        # Start reconciliation loop in background
        self.client.loop.create_task(self.monitor_pending_stories())

    async def on_raw_reaction_add(self, payload):
        if payload.user_id == self.client.user.id:
            return
        if payload.channel_id != self.verification_channel_id:
            return
        try:
            await self._handle_reaction_event(payload.channel_id, payload.message_id)
        except Exception as e:
            self.logger.error(f"Error handling reaction add: {e}")

    async def on_message(self, message):
        if message.author.bot:
            return
        if message.channel.id != self.verification_channel_id:
            return

        content = message.content.strip()
        if not content.lower().startswith('edit:'):
            return

        new_text = content[5:].strip()
        if not new_text:
            return

        # Apply to most recent edit_requested story
        self.state = self._load_state()
        target = None
        for story in reversed(self.state.get('pending_stories', [])):
            if story.get('draft_status') == 'edit_requested':
                target = story
                break

        if not target:
            return

        target['tweet_draft'] = new_text
        target['draft_status'] = 'needs_review'
        target['discord_message_id'] = None
        target['discord_message_ts'] = None
        self._update_ledger_status(target, 'edited')
        self._save_state()

        await message.channel.send(f"✅ Updated draft for **{target.get('topic') or target.get('title')}**. Re-posting for review.")

        # Re-post approval message
        try:
            from src.utils.discord_approval import send_approval_webhook
            message_id = send_approval_webhook(target)
            if message_id:
                target['discord_message_id'] = message_id
                target['discord_message_ts'] = datetime.utcnow().isoformat()
                target['draft_status'] = 'posted_for_review'
                self._save_state()
        except Exception as e:
            self.logger.error(f"Failed to re-post edited draft: {e}")

    async def on_raw_reaction_remove(self, payload):
        if payload.channel_id != self.verification_channel_id:
            return
        try:
            await self._handle_reaction_event(payload.channel_id, payload.message_id)
        except Exception as e:
            self.logger.error(f"Error handling reaction remove: {e}")

    def run(self):
        """
        Start the Discord bot
        """
        self.client.run(self.config['discord']['bot_token'])

def main():
    monitor = StantonTimesReactionMonitor()
    monitor.run()

if __name__ == "__main__":
    main()
