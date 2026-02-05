import discord
from discord import Webhook
import asyncio

class WebhookCreator:
    CHANNEL_ID = 1207388252411453480
    TOKEN_PATH = '/Users/zachgonser/.credentials/stanton_times_discord_token'
    WEBHOOK_PATH = '/Users/zachgonser/.credentials/stanton_times_discord_webhook'

    def __init__(self, token):
        self.token = token
        intents = discord.Intents.default()
        intents.guilds = True
        self.client = discord.Client(intents=intents)

    async def create_webhook(self):
        await self.client.login(self.token)
        
        try:
            channel = self.client.get_channel(self.CHANNEL_ID)
            
            if not channel:
                print(f"Could not find channel with ID {self.CHANNEL_ID}")
                return False

            webhook = await channel.create_webhook(name="Stanton Times Webhook")
            
            webhook_url = f"https://discord.com/api/webhooks/{webhook.id}/{webhook.token}"
            
            with open(self.WEBHOOK_PATH, 'w') as f:
                f.write(webhook_url)
            
            print(f"Webhook created: {webhook_url}")
            return True
        
        except Exception as e:
            print(f"Error creating webhook: {e}")
            return False
        finally:
            await self.client.close()

async def main():
    with open('/Users/zachgonser/.credentials/stanton_times_discord_token', 'r') as f:
        token = f.read().strip()
    
    creator = WebhookCreator(token)
    await creator.create_webhook()

if __name__ == "__main__":
    asyncio.run(main())