#!/usr/bin/env python3
"""StantonTimes cron-state manager.

This manages the lightweight cron-driven state file:
  ~/clawd/projects/stanton-times/state.json

Goals:
- Avoid OpenClaw `edit` tool (exact match brittleness)
- Atomic writes
- Safe recovery if JSON is corrupt
- Simple primitives for cron prompts

State schema (v1):
{
  "schema_version": 1,
  "last_check": <unix>,
  "seen_tweet_ids": ["..."]
  "pendingApprovals": [ { ... } ],
  "posted_stories": [ ... ],
  "handled_interactions": [ ... ]
}
"""

from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

AGENT_ID = (os.getenv("OPENCLAW_AGENT_ID") or os.getenv("AGENT_ID") or "main")
WORKSPACE_ROOT = Path(
    os.getenv("OPENCLAW_WORKSPACE")
    or os.getenv("AGENT_WORKSPACE")
    or os.getenv("WORKSPACE_ROOT")
    or Path(__file__).resolve().parents[1]
).expanduser().resolve()
STATE_PATH = WORKSPACE_ROOT / "projects" / "stanton-times" / "state.json"
TMPDIR = Path("/tmp") / f"agent-{''.join(c if c.isalnum() or c in '._-' else '-' for c in AGENT_ID)}"
TMPDIR.mkdir(parents=True, exist_ok=True)



def _default_state() -> dict:
    return {
        "schema_version": 1,
        "last_check": int(time.time()),
        "seen_tweet_ids": [],
        "pendingApprovals": [],
        "posted_stories": [],
        "handled_interactions": [],
    }


@dataclass
class LockedFile:
    path: Path
    fh: object

    def __enter__(self):
        # macOS supports fcntl
        import fcntl  # type: ignore

        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.fh = open(self.path, "a+")
        fcntl.flock(self.fh.fileno(), fcntl.LOCK_EX)
        self.fh.seek(0)
        return self.fh

    def __exit__(self, exc_type, exc, tb):
        import fcntl  # type: ignore

        try:
            fcntl.flock(self.fh.fileno(), fcntl.LOCK_UN)
        finally:
            self.fh.close()


def _load_or_recover(text: str) -> dict:
    if not text.strip():
        return _default_state()
    try:
        obj = json.loads(text)
        if not isinstance(obj, dict):
            return _default_state()
        return obj
    except Exception:
        return _default_state()


def ensure_state() -> dict:
    with LockedFile(STATE_PATH, None) as fh:  # type: ignore
        fh.seek(0)
        raw = fh.read()
        state = _load_or_recover(raw)
        # If raw was corrupt, back it up for forensics
        if raw.strip() and state == _default_state():
            bak = STATE_PATH.with_suffix(f".json.corrupt-{int(time.time())}.bak")
            bak.write_text(raw)
        state.setdefault("schema_version", 1)
        state.setdefault("seen_tweet_ids", [])
        state.setdefault("pendingApprovals", [])
        state.setdefault("posted_stories", [])
        state.setdefault("handled_interactions", [])
        state["last_check"] = int(time.time())
        _atomic_write(state)
        return state


def _atomic_write(state: dict) -> None:
    tmp = STATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2))
    os.replace(tmp, STATE_PATH)


def add_seen(tweet_id: str) -> None:
    state = ensure_state()
    seen = state.setdefault("seen_tweet_ids", [])
    if tweet_id not in seen:
        seen.append(tweet_id)
    state["last_check"] = int(time.time())
    _atomic_write(state)


def add_approval(source: str, tweet_id: str, url: str, topic: str, draft: str, kind: str = "story") -> str:
    state = ensure_state()

    if tweet_id and tweet_id not in state["seen_tweet_ids"]:
        state["seen_tweet_ids"].append(tweet_id)

    approval_id = str(uuid.uuid4())[:12]
    approval = {
        "id": approval_id,
        "created_at": int(time.time()),
        "type": kind,
        "source": source,
        "source_tweet_id": tweet_id,
        "url": url,
        "topic": topic,
        "draft": draft,
        "status": "pending",
    }
    state.setdefault("pendingApprovals", []).append(approval)
    state["last_check"] = int(time.time())
    _atomic_write(state)
    return approval_id


def list_pending() -> list[dict]:
    state = ensure_state()
    pending = state.get("pendingApprovals") or []
    return pending if isinstance(pending, list) else []


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ensure")

    ap_seen = sub.add_parser("add-seen")
    ap_seen.add_argument("tweet_id")

    ap_add = sub.add_parser("add-approval")
    ap_add.add_argument("--source", required=True)
    ap_add.add_argument("--tweet-id", required=True)
    ap_add.add_argument("--url", required=True)
    ap_add.add_argument("--topic", required=True)
    ap_add.add_argument("--draft", required=True)
    ap_add.add_argument("--kind", default="story", choices=["story", "reply"])

    sub.add_parser("list-pending")

    args = ap.parse_args()

    if args.cmd == "ensure":
        ensure_state()
        print("STATE_OK")
    elif args.cmd == "add-seen":
        add_seen(args.tweet_id)
        print("SEEN_OK")
    elif args.cmd == "add-approval":
        approval_id = add_approval(
            source=args.source,
            tweet_id=args.tweet_id,
            url=args.url,
            topic=args.topic,
            draft=args.draft,
            kind=args.kind,
        )
        print(approval_id)
    elif args.cmd == "list-pending":
        print(json.dumps(list_pending(), indent=2))


if __name__ == "__main__":
    main()
