from datetime import datetime
from typing import Any, Dict, Optional

from src.config import load_config
from src.notify.discord_webhook import add_reactions, send_webhook_payload

APPROVAL_EMOJIS = {
    "approve": "✅",
    "reject": "❌",
    "hold": "🤔",
    "edit": "✏️",
}


def _story_title(story: Dict[str, Any]) -> str:
    return story.get("topic") or story.get("title") or "Untitled"


def build_approval_embed(story: Dict[str, Any]) -> Dict[str, Any]:
    title = _story_title(story)
    description = (
        story.get("tweet_draft")
        or story.get("simulated_draft")
        or story.get("description")
        or "No draft available."
    )

    # Discord embed description limit 4096
    if len(description) > 4000:
        description = description[:3997] + "..."

    score = story.get("content_score") or story.get("score") or 0
    fields = [
        {"name": "Source", "value": story.get("source", "Unknown"), "inline": True},
        {"name": "Score", "value": f"{float(score):.2f}", "inline": True},
    ]

    link = story.get("link")
    if link:
        fields.append({"name": "Link", "value": link, "inline": False})

    thread_draft = story.get("thread_draft")
    if thread_draft:
        trimmed = thread_draft if len(thread_draft) <= 1000 else thread_draft[:997] + "..."
        fields.append({"name": "Thread Draft", "value": trimmed, "inline": False})

    story_id = story.get("story_id")
    if story_id:
        fields.append({"name": "Story ID", "value": story_id, "inline": True})

    return {
        "title": f"🗞️ Stanton Times Draft: {title}",
        "description": description,
        "color": 5793266,
        "fields": fields,
        "footer": {
            "text": f"React to decide: {APPROVAL_EMOJIS['approve']} approve | {APPROVAL_EMOJIS['reject']} reject | {APPROVAL_EMOJIS['hold']} hold | {APPROVAL_EMOJIS['edit']} request edits"
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


def send_approval_webhook(story: Dict[str, Any], webhook_url: Optional[str] = None, mention: Optional[str] = None) -> Optional[str]:
    config = load_config()
    webhook_url = webhook_url or config.get("discord", {}).get("webhook_url", "")

    if not webhook_url:
        raise ValueError("Discord webhook URL not configured.")

    mention_text = mention or config.get("discord", {}).get("approval_mention", "")
    payload = {
        "content": mention_text,
        "embeds": [build_approval_embed(story)],
    }

    message_id = send_webhook_payload(webhook_url, payload)
    if message_id:
        discord_cfg = config.get("discord", {})
        channel_id = str(discord_cfg.get("channel_id") or discord_cfg.get("verification_channel_id") or "")
        bot_token = str(discord_cfg.get("bot_token") or "")
        add_reactions(
            message_id=str(message_id),
            channel_id=channel_id,
            bot_token=bot_token,
            emojis=APPROVAL_EMOJIS.values(),
        )

    return message_id
