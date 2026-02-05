import discord
from discord.ext import commands
import os

# Read bot token
with open('/Users/zachgonser/.credentials/stanton_times_discord_token', 'r') as f:
    BOT_TOKEN = f.read().strip()

# Intents configuration
intents = discord.Intents.default()
intents.message_content = True
intents.reactions = True

# Create bot instance
bot = commands.Bot(command_prefix='!st ', intents=intents)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user.name} (ID: {bot.user.id})')
    print('Stanton Times Bot is ready!')

@bot.command(name='ping')
async def ping(ctx):
    """Simple ping command to verify bot is working"""
    await ctx.send(f'Pong! Latency is {round(bot.latency * 1000)}ms')

@bot.command(name='about')
async def about(ctx):
    """Provide information about the Stanton Times bot"""
    embed = discord.Embed(
        title="Stanton Times Bot",
        description="Autonomous content processing for Star Citizen news",
        color=discord.Color.blue()
    )
    embed.add_field(name="Version", value="1.0.0", inline=False)
    embed.add_field(name="Purpose", value="Monitor, process, and publish Star Citizen news", inline=False)
    await ctx.send(embed=embed)

def main():
    bot.run(BOT_TOKEN)

if __name__ == '__main__':
    main()