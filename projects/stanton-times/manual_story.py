import json
import asyncio
import discord

from src.config import ensure_state_file, get_config_path, load_config
from src.state.store import load_state, save_state
from src.utils.discord_approval import send_approval_webhook


class ManualStoryPoster:
    def __init__(self, config_path=None, state_path=None):
        # Load configuration
        self.config = load_config()
        self.config_path = config_path or str(get_config_path())

        # Load state
        state_path = state_path or str(ensure_state_file())
        self.state_path = state_path
        self.state = load_state(state_path)

    def post_story(self, story_details):
        """
        Manually post a story to the verification channel using webhook flow
        """
        message_id = send_approval_webhook(story_details)
        if message_id:
            story_details['draft_status'] = 'posted_for_review'
            story_details['discord_message_id'] = str(message_id)
        else:
            story_details['draft_status'] = 'needs_review'

        self.state['pending_stories'].append(story_details)

        # Save updated state
        self.state = save_state(self.state_path, self.state)

    def create_story_interactively(self):
        """
        Interactively create a story from command line input
        """
        print("Creating a new Stanton Times story:")

        topic = input("Enter story topic: ")
        source = input("Enter source (default: RobertsSpaceInd): ") or "RobertsSpaceInd"
        tweet_draft = input("Enter tweet draft text: ")

        # Optional score input
        while True:
            try:
                content_score = float(input("Enter content score (0-1, default 0.8): ") or "0.8")
                if 0 <= content_score <= 1:
                    break
                print("Score must be between 0 and 1")
            except ValueError:
                print("Please enter a valid number")

        return {
            "topic": topic,
            "source": source,
            "tweet_draft": tweet_draft,
            "content_score": content_score,
            "draft_status": "needs_review"
        }


def main():
    poster = ManualStoryPoster()
    poster.post_story(poster.create_story_interactively())


if __name__ == "__main__":
    main()
