#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from typing import Any, Dict

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from src.config import get_state_path

MEMORY_STATE_PATH = PROJECT_ROOT / "../memory/stanton-times/state.json"
LEGACY_STATE_PATH = PROJECT_ROOT / "state.json"


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return json.load(f)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)


def main() -> None:
    primary_state = _load_json(MEMORY_STATE_PATH)
    legacy_state = _load_json(LEGACY_STATE_PATH)

    merged_state: Dict[str, Any] = {}
    merged_state.update(primary_state)

    if legacy_state:
        ops = merged_state.setdefault("ops", {})
        if "lastCheck" in legacy_state:
            ops["last_check"] = legacy_state.get("lastCheck")
        if "seenTweets" in legacy_state:
            ops["seen_tweets"] = legacy_state.get("seenTweets")
        if "pendingApprovals" in legacy_state:
            ops["pending_approvals"] = legacy_state.get("pendingApprovals")
        if "notes" in legacy_state:
            ops["notes"] = legacy_state.get("notes")

    _write_json(get_state_path(), merged_state)
    print(f"Merged state written to {get_state_path()}")


if __name__ == "__main__":
    main()
