import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ledger import StantonTimesLedger
from src.config import PROJECT_ROOT, ensure_state_file, load_config


def _story_timestamp(story):
    for key in ("discord_message_ts", "created_at", "timestamp", "published_at"):
        value = story.get(key)
        if not value:
            continue
        try:
            cleaned = value.replace("Z", "+00:00") if isinstance(value, str) else value
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo:
                dt = dt.astimezone(tz=None).replace(tzinfo=None)
            return dt
        except Exception:
            continue
    return None


def main():
    config = load_config()
    ci = config.get("content_intelligence", {}) or {}
    archive_days = int(ci.get("draft_archive_days", 7))
    cluster_purge_days = int(ci.get("cluster_purge_days", 60))

    state_path = Path(ensure_state_file())
    state = json.loads(state_path.read_text())
    now = datetime.utcnow()
    cutoff = now - timedelta(days=archive_days)

    archived = []
    remaining = []
    for story in state.get("pending_stories", []):
        ts = _story_timestamp(story) or now
        status = story.get("draft_status")
        if status in ("needs_review", "posted_for_review", "edit_requested", "hold") and ts < cutoff:
            story["archive_reason"] = f"stale>{archive_days}d"
            archived.append(story)
        else:
            remaining.append(story)

    if archived:
        archive_dir = PROJECT_ROOT / "archives"
        archive_dir.mkdir(parents=True, exist_ok=True)
        archive_file = archive_dir / f"stanton_times_state_archive_{now.strftime('%Y%m%d')}.json"
        existing = []
        if archive_file.exists():
            try:
                existing = json.loads(archive_file.read_text())
            except Exception:
                existing = []
        archive_file.write_text(json.dumps(existing + archived, indent=2))

    state["pending_stories"] = remaining
    state_path.write_text(json.dumps(state, indent=2))

    # Ledger cleanup
    ledger = StantonTimesLedger()
    ledger.archive_stale_items(days=archive_days)
    ledger.purge_old_clusters(days=cluster_purge_days)


if __name__ == "__main__":
    main()
