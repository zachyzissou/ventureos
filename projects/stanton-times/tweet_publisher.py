import tweepy
import json
import logging
from content_processor import StantonTimesContentProcessor

class TweetPublisher:
    def __init__(self, config_path, state_file_path):
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        # Twitter API Setup
        self.twitter_client = tweepy.Client(
            consumer_key=self.config['twitter']['consumer_key'],
            consumer_secret=self.config['twitter']['consumer_secret'],
            access_token=self.config['twitter']['access_token'],
            access_token_secret=self.config['twitter']['access_token_secret']
        )
        
        self.content_processor = StantonTimesContentProcessor(state_file_path)
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    def publish_pending_tweets(self):
        pending_stories = self.content_processor.state.get('pending_stories', [])
        
        for story in pending_stories:
            if story.get('draft_status') == 'approved':
                try:
                    tweet_text = story.get('tweet_draft', '')
                    
                    # Ensure tweet is within 280 character limit
                    if len(tweet_text) > 280:
                        tweet_text = tweet_text[:277] + '...'
                    
                    response = self.twitter_client.create_tweet(text=tweet_text)
                    
                    self.logger.info(f"Published tweet: {tweet_text}")
                    
                    # Update story status
                    story['draft_status'] = 'published'
                    story['tweet_id'] = response.data['id']
                
                except Exception as e:
                    self.logger.error(f"Failed to publish tweet: {e}")
        
        # Save updated state
        with open(self.content_processor.state_file_path, 'w') as f:
            json.dump(self.content_processor.state, f, indent=2)

def main():
    publisher = TweetPublisher(
        '/Users/zachgonser/clawd/projects/stanton-times/config.json',
        '/Users/zachgonser/clawd/memory/stanton-times/state.json'
    )
    publisher.publish_pending_tweets()

if __name__ == "__main__":
    main()