import discord
from discord.ext import commands
import os
from pathlib import Path

def _load_bot_token() -> str:
    token = (os.getenv("STANTON_TIMES_DISCORD_BOT_TOKEN") or "").strip()
    if token:
        return token

    token_file = Path(
        os.getenv(
            "STANTON_TIMES_DISCORD_BOT_TOKEN_FILE",
            str(Path.home() / ".credentials" / "stanton_times_discord_bot_token"),
        )
    )
    if token_file.exists():
        return token_file.read_text().strip()
    return ""


BOT_TOKEN = _load_bot_token()
if not BOT_TOKEN:
    raise SystemExit(
        "Missing Discord bot token. Set STANTON_TIMES_DISCORD_BOT_TOKEN or STANTON_TIMES_DISCORD_BOT_TOKEN_FILE."
    )

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
