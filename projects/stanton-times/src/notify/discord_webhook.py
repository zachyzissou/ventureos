from __future__ import annotations

import json
from typing import Any, Dict, Iterable, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import requests


class DiscordWebhookError(RuntimeError):
    pass


def with_wait_param(webhook_url: str) -> str:
    parsed = urlparse(webhook_url)
    query = parse_qs(parsed.query)
    query["wait"] = ["true"]
    new_query = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def send_webhook_payload(webhook_url: str, payload: Dict[str, Any]) -> Optional[str]:
    """
    POST a webhook payload and return Discord message id when available.
    Uses `wait=true` so Discord returns a message object.
    """
    resp = requests.post(with_wait_param(webhook_url), json=payload)

    if resp.status_code in (200, 204):
        if resp.status_code == 200:
            try:
                data = resp.json()
            except json.JSONDecodeError:
                return None
            message_id = data.get("id")
            return str(message_id) if message_id else None
        return None

    raise DiscordWebhookError(f"Failed to send webhook: {resp.status_code} {resp.text}")


def add_reactions(
    *,
    message_id: str,
    channel_id: str,
    bot_token: str,
    emojis: Iterable[str],
) -> None:
    """
    Best-effort reaction seeding. No-op on errors.
    """
    if not (message_id and channel_id and bot_token):
        return

    headers = {"Authorization": f"Bot {bot_token}"}
    for emoji in emojis:
        try:
            encoded = requests.utils.quote(str(emoji))
            url = f"https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}/reactions/{encoded}/@me"
            resp = requests.put(url, headers=headers)
            if resp.status_code not in (200, 204):
                continue
        except Exception:
            continue

