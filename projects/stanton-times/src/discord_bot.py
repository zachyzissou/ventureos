import discord
import sys
import logging
from datetime import datetime

from src.config import get_log_path, load_config

# Verbose logging
logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    handlers=[
                        logging.FileHandler(get_log_path('discord_bot_verbose.log')),
                        logging.StreamHandler(sys.stdout)
                    ])

class StantonTimesDiscordBot:
    def __init__(self, token, verification_channel_id):
        self.verification_channel_id = verification_channel_id
        logging.debug(f"Initializing bot with token length: {len(token)}")
        
        # Explicitly configure intents
        intents = discord.Intents.default()
        intents.message_content = True
        intents.messages = True

        self.token = token
        self.client = discord.Client(intents=intents)

        # Bind events
        self.client.event(self.on_ready)

    async def on_ready(self):
        logging.critical(f"Bot connected as {self.client.user}")
        
        try:
            channel = self.client.get_channel(self.verification_channel_id)
            
            if channel:
                await channel.send(f"🚀 Stanton Times Bot Online at {datetime.now().isoformat()}")
            else:
                logging.error(f"Could not access channel {self.VERIFICATION_CHANNEL_ID}")
        
        except Exception as e:
            logging.error(f"Message send failed: {e}")

    def run(self):
        logging.debug("Attempting to run bot")
        try:
            self.client.run(self.token)
        except Exception as e:
            logging.critical(f"Bot run failed: {e}")
            raise

def main():
    config = load_config()
    token = config.get('discord', {}).get('bot_token')
    channel_id = config.get('discord', {}).get('verification_channel_id')

    if not token:
        raise ValueError('Discord bot token not found in config or env overrides')
    if not channel_id:
        raise ValueError('discord.verification_channel_id missing from config')

    logging.debug(f"Loaded token, length: {len(token)}")
    
    bot = StantonTimesDiscordBot(token, int(channel_id))
    bot.run()

if __name__ == "__main__":
    main()