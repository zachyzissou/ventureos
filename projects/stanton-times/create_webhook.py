import discord
from discord import Webhook
import asyncio
import os
from pathlib import Path

from src.config import load_config

class WebhookCreator:
    def __init__(self, token: str, channel_id: int, webhook_path: Path):
        self.token = token
        self.channel_id = int(channel_id)
        self.webhook_path = Path(webhook_path)
        intents = discord.Intents.default()
        intents.guilds = True
        self.client = discord.Client(intents=intents)

    async def create_webhook(self):
        await self.client.login(self.token)
        
        try:
            channel = self.client.get_channel(self.channel_id)
            
            if not channel:
                print(f"Could not find channel with ID {self.channel_id}")
                return False

            webhook = await channel.create_webhook(name="Stanton Times Webhook")
            
            webhook_url = f"https://discord.com/api/webhooks/{webhook.id}/{webhook.token}"
            
            self.webhook_path.parent.mkdir(parents=True, exist_ok=True)
            self.webhook_path.write_text(webhook_url)
            
            print(f"Webhook created: {webhook_url}")
            return True
        
        except Exception as e:
            print(f"Error creating webhook: {e}")
            return False
        finally:
            await self.client.close()

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

    webhook_path = Path(
        os.getenv(
            "STANTON_TIMES_DISCORD_WEBHOOK_FILE",
            str(Path.home() / ".credentials" / "stanton_times_discord_webhook"),
        )
    )

    creator = WebhookCreator(token, channel_id, webhook_path)
    await creator.create_webhook()

if __name__ == "__main__":
    asyncio.run(main())
