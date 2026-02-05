import json
import sys
import asyncio
import discord

class ManualStoryPoster:
    def __init__(self, config_path, state_path):
        # Load configuration
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        # Load state
        with open(state_path, 'r') as f:
            self.state = json.load(f)
        
        # Discord client setup
        intents = discord.Intents.default()
        intents.message_content = True
        self.client = discord.Client(intents=intents)

    async def post_story(self, story_details):
        """
        Manually post a story to the verification channel
        """
        channel = self.client.get_channel(int(self.config['discord']['verification_channel_id']))
        
        if not channel:
            print(f"Could not find channel with ID {self.config['discord']['verification_channel_id']}")
            return

        # Create embed
        embed = discord.Embed(
            title=f"🗞️ Stanton Times Draft: {story_details['topic']}",
            description=story_details['tweet_draft'],
            color=0x5865F2  # Blurple
        )
        
        # Add source and score information
        embed.add_field(name="Source", value=story_details.get('source', 'Unknown'), inline=True)
        embed.add_field(name="Content Score", value=f"{story_details.get('content_score', 0):.2f}", inline=True)
        
        # Set footer
        embed.set_footer(text="The Stanton Times - Bringing the 'verse to you")

        # Send message
        message = await channel.send(embed=embed)
        
        # Add reaction buttons
        await message.add_reaction('✅')  # Approve
        await message.add_reaction('❌')  # Reject
        await message.add_reaction('🤔')  # Needs more context

        # Update state
        story_details['draft_status'] = 'posted_for_review'
        self.state['pending_stories'].append(story_details)
        
        # Save updated state
        with open('/Users/zachgonser/clawd/memory/stanton-times/state.json', 'w') as f:
            json.dump(self.state, f, indent=2)

    async def run(self):
        """
        Run the bot and post the story
        """
        await self.client.login(self.config['discord']['bot_token'])
        await self.post_story(self.create_story_interactively())
        await self.client.close()

    def create_story_interactively(self):
        """
        Interactively create a story from command line input
        """
        print("Creating a new Stanton Times story:")
        
        topic = input("Enter story topic: ")
        source = input("Enter source (default: RobertsSpaceInd): ") or "RobertsSpaceInd"
        tweet_draft = input("Enter tweet draft text: ")
        
        # Optional score input
        while True:
            try:
                content_score = float(input("Enter content score (0-1, default 0.8): ") or "0.8")
                if 0 <= content_score <= 1:
                    break
                print("Score must be between 0 and 1")
            except ValueError:
                print("Please enter a valid number")

        return {
            "topic": topic,
            "source": source,
            "tweet_draft": tweet_draft,
            "content_score": content_score,
            "draft_status": "needs_review"
        }

def main():
    # Paths to config and state files
    config_path = '/Users/zachgonser/clawd/projects/stanton-times/config.json'
    state_path = '/Users/zachgonser/clawd/memory/stanton-times/state.json'

    # Create poster instance
    poster = ManualStoryPoster(config_path, state_path)

    # Run async event loop
    asyncio.run(poster.run())

if __name__ == "__main__":
    main()