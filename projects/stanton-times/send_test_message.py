import discord
import asyncio
import logging
import os
from pathlib import Path

from src.config import load_config

logging.basicConfig(level=logging.DEBUG)

class TestMessageSender:
    def __init__(self, token, channel_id):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.messages = True
        self.client = discord.Client(intents=intents)
        self.token = token
        self.channel_id = channel_id

    async def send_test_message(self):
        print(f"Attempting to send message to channel {self.channel_id}")
        channel = self.client.get_channel(self.channel_id)
        
        if channel:
            await channel.send("Test message from Stanton Times bot. Verification complete.")
        else:
            print(f"Could not find channel with ID {self.channel_id}")
        
        await self.client.close()

    async def start(self):
        print("Starting client...")
        await self.client.login(self.token)
        print("Logged in successfully")
        await self.send_test_message()

async def main():
    cfg = load_config()
    discord_cfg = cfg.get("discord", {}) or {}
    channel_id = int(discord_cfg.get("channel_id") or discord_cfg.get("verification_channel_id") or 0)
    if not channel_id:
        raise SystemExit("Missing discord.channel_id (or discord.verification_channel_id) in config/config.json.")

    token = (os.getenv("STANTON_TIMES_DISCORD_BOT_TOKEN") or "").strip()
    if not token:
        token_file = Path(
            os.getenv(
                "STANTON_TIMES_DISCORD_BOT_TOKEN_FILE",
                str(Path.home() / ".credentials" / "stanton_times_discord_bot_token"),
            )
        )
        if token_file.exists():
            token = token_file.read_text().strip()

    if not token:
        raise SystemExit(
            "Missing Discord bot token. Set STANTON_TIMES_DISCORD_BOT_TOKEN or STANTON_TIMES_DISCORD_BOT_TOKEN_FILE."
        )

    sender = TestMessageSender(token, channel_id)
    await sender.start()

if __name__ == "__main__":
    asyncio.run(main())
