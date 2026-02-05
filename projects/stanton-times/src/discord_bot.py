import discord
import sys
import logging
from datetime import datetime

# Verbose logging
logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    handlers=[
                        logging.FileHandler('/Users/zachgonser/clawd/projects/stanton-times/logs/discord_bot_verbose.log'),
                        logging.StreamHandler(sys.stdout)
                    ])

class StantonTimesDiscordBot:
    VERIFICATION_CHANNEL_ID = 1207388252411453480

    def __init__(self, token):
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
            channel = self.client.get_channel(self.VERIFICATION_CHANNEL_ID)
            
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
    with open('/Users/zachgonser/.credentials/stanton_times_discord_token', 'r') as f:
        token = f.read().strip()
    
    logging.debug(f"Loaded token, length: {len(token)}")
    
    bot = StantonTimesDiscordBot(token)
    bot.run()

if __name__ == "__main__":
    main()