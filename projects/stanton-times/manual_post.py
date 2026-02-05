import sys
import json
import discord

async def post_story(bot, story):
    """
    Manually post a story to the verification channel
    """
    channel = bot.get_channel(int(bot.verification_channel_id))
    
    if not channel:
        print(f"Could not find channel with ID {bot.verification_channel_id}")
        return

    # Create an embed
    embed = discord.Embed(
        title=f"Manual Story Draft: {story.get('topic', 'Untitled')}",
        description=story.get('tweet_draft', 'No draft available'),
        color=discord.Color.blue()
    )
    
    # Add source information
    embed.add_field(name="Source", value=story.get('source', 'Unknown'), inline=True)
    embed.add_field(name="Content Score", value=f"{story.get('content_score', 0):.2f}", inline=True)
    
    # Send message with reactions for approval
    message = await channel.send(embed=embed)
    await message.add_reaction('✅')  # Approve
    await message.add_reaction('❌')  # Reject
    await message.add_reaction('🤔')  # Needs more context

async def main():
    # Load configuration
    with open('/Users/zachgonser/clawd/projects/stanton-times/config.json', 'r') as f:
        config = json.load(f)

    # Create bot instance
    intents = discord.Intents.default()
    intents.message_content = True
    bot = discord.Client(intents=intents)
    
    # Set verification channel ID as an attribute
    bot.verification_channel_id = config['discord']['verification_channel_id']

    @bot.event
    async def on_ready():
        print(f'Logged in as {bot.user}')
        
        # Load state file
        with open('/Users/zachgonser/clawd/memory/stanton-times/state.json', 'r') as f:
            state = json.load(f)
        
        # Check for any pending stories
        pending_stories = state.get('pending_stories', [])
        
        if not pending_stories:
            print("No pending stories to post.")
            await bot.close()
            return
        
        # Post first pending story
        story = pending_stories[0]
        await post_story(bot, story)
        
        # Update story status
        story['draft_status'] = 'posted_for_review'
        
        # Save updated state
        with open('/Users/zachgonser/clawd/memory/stanton-times/state.json', 'w') as f:
            json.dump(state, f, indent=2)
        
        await bot.close()

    # Run the bot
    await bot.start(config['discord']['bot_token'])

if __name__ == '__main__':
    import asyncio
    asyncio.run(main())