import subprocess
import json
import logging
from datetime import datetime, timedelta

class BirdMonitor:
    def __init__(self, config_path):
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        self.logger = logging.getLogger(__name__)
        logging.basicConfig(level=logging.INFO)
        
        # Path to bird-auth.sh script
        self.bird_auth_path = "/Users/zachgonser/clawd/scripts/bird-auth.sh"
        
        # Monitored accounts from config
        self.monitored_accounts = self.config.get('monitored_accounts', [
            'RobertsSpaceInd', 
            'starcitizenbot', 
            'TheRubenSaurus'
        ])

    def _run_bird_command(self, command):
        """
        Run bird command with authentication wrapper
        """
        try:
            full_command = f"{self.bird_auth_path} {command}"
            result = subprocess.run(full_command, shell=True, capture_output=True, text=True)
            
            if result.returncode != 0:
                self.logger.error(f"Bird command failed: {result.stderr}")
                return None
            
            return result.stdout
        except Exception as e:
            self.logger.error(f"Error running bird command: {e}")
            return None

    def fetch_recent_tweets(self, account):
        """
        Fetch recent tweets using bird CLI
        """
        command = f"user-tweets {account}"
        
        tweets_raw = self._run_bird_command(command)
        
        if not tweets_raw:
            return []
        
        # Basic parsing of raw output
        tweets = []
        for line in tweets_raw.split('\n'):
            if line.strip():
                try:
                    tweet_data = {
                        'text': line,
                        'source': account
                    }
                    tweets.append(tweet_data)
                except Exception as e:
                    self.logger.error(f"Error parsing tweet: {e}")
        
        return tweets

    def process_tweets(self):
        """
        Process tweets for all monitored accounts
        """
        all_tweets = {}
        
        for account in self.monitored_accounts:
            tweets = self.fetch_recent_tweets(account)
            
            if tweets:
                all_tweets[account] = tweets
                self.logger.info(f"Fetched {len(tweets)} tweets from {account}")
        
        return all_tweets

def main():
    # Example usage
    monitor = BirdMonitor('/Users/zachgonser/clawd/projects/stanton-times/config.json')
    tweets = monitor.process_tweets()
    
    # Optional: print tweets or pass to content processor
    for account, account_tweets in tweets.items():
        print(f"{account}: {len(account_tweets)} tweets")
        for tweet in account_tweets[:3]:  # Print first 3 tweets
            print(f"- {tweet.get('text', 'No text')}")

if __name__ == "__main__":
    main()