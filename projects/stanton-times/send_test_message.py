import discord
import asyncio
import logging

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
    with open('/Users/zachgonser/.credentials/stanton_times_discord_token', 'r') as f:
        token = f.read().strip()
    
    sender = TestMessageSender(token, 1207388252411453480)
    await sender.start()

if __name__ == "__main__":
    asyncio.run(main())