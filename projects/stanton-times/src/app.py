#!/usr/bin/env python3
import argparse

from src.source_monitor import AdvancedSourceMonitor
from src.config import PROJECT_ROOT
from discord_verifier import StantonTimesDiscordNotifier
from reaction_monitor import StantonTimesReactionMonitor
from tweet_publisher import TweetPublisher
from content_cleanup import ContentCleaner


def run_monitor() -> None:
    monitor = AdvancedSourceMonitor()
    monitor.process_sources()
    monitor.notify_discord()


def run_verify() -> None:
    notifier = StantonTimesDiscordNotifier()
    notifier.process_pending_stories()


def run_reactions() -> None:
    monitor = StantonTimesReactionMonitor()
    monitor.run()


def run_publish() -> None:
    publisher = TweetPublisher()
    publisher.publish_pending_tweets()


def run_cleanup() -> None:
    cleaner = ContentCleaner()
    cleaner.cleanup_old_content()
    cleaner.archive_old_stories(str(PROJECT_ROOT / 'archives'))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Stanton Times unified entrypoint")
    parser.add_argument(
        "command",
        choices=["monitor", "verify", "react", "publish", "cleanup"],
        help="Task to run",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "monitor":
        run_monitor()
    elif args.command == "verify":
        run_verify()
    elif args.command == "react":
        run_reactions()
    elif args.command == "publish":
        run_publish()
    elif args.command == "cleanup":
        run_cleanup()


if __name__ == "__main__":
    main()
