from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable, Dict, Mapping, MutableMapping, Optional

from src.scoring.relevance import DEFAULT_DRAFT_THRESHOLD, DEFAULT_SCORING_WEIGHTS


class StateValidationError(ValueError):
    pass


State = Dict[str, Any]


def default_state() -> State:
    return {
        "content_intelligence": {
            "scoring_weights": dict(DEFAULT_SCORING_WEIGHTS),
            "draft_threshold": float(DEFAULT_DRAFT_THRESHOLD),
        },
        "pending_stories": [],
        "seen_tweet_ids": {},
        "last_checked": {},
        "processed_sources": {},
    }


def _validate_mapping(name: str, value: Any) -> MutableMapping[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise StateValidationError(f"{name} must be an object/dict")
    return dict(value)


def coerce_state(raw: Any) -> State:
    if raw is None:
        raw = {}
    if not isinstance(raw, Mapping):
        raise StateValidationError("state must be a JSON object")

    state: State = dict(raw)  # preserve unknown keys

    # content_intelligence
    ci = _validate_mapping("content_intelligence", state.get("content_intelligence"))
    weights = _validate_mapping("content_intelligence.scoring_weights", ci.get("scoring_weights"))
    coerced_weights: Dict[str, float] = dict(DEFAULT_SCORING_WEIGHTS)
    for key, val in weights.items():
        try:
            coerced_weights[str(key)] = float(val)
        except (TypeError, ValueError):
            continue
    ci["scoring_weights"] = coerced_weights

    try:
        ci["draft_threshold"] = float(ci.get("draft_threshold", DEFAULT_DRAFT_THRESHOLD))
    except (TypeError, ValueError):
        ci["draft_threshold"] = float(DEFAULT_DRAFT_THRESHOLD)

    state["content_intelligence"] = ci

    # top-level collections
    pending = state.get("pending_stories", [])
    if pending is None:
        pending = []
    if not isinstance(pending, list):
        raise StateValidationError("pending_stories must be an array/list")
    state["pending_stories"] = pending

    state["seen_tweet_ids"] = _validate_mapping("seen_tweet_ids", state.get("seen_tweet_ids"))
    state["last_checked"] = _validate_mapping("last_checked", state.get("last_checked"))
    state["processed_sources"] = _validate_mapping("processed_sources", state.get("processed_sources"))

    return state


def load_state(path: str | Path, *, create_if_missing: bool = True) -> State:
    p = Path(path)
    if not p.exists():
        if not create_if_missing:
            raise FileNotFoundError(str(p))
        state = default_state()
        save_state(p, state)
        return state

    with p.open("r") as f:
        raw = json.load(f)
    return coerce_state(raw)


def save_state(path: str | Path, state: Any) -> State:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    coerced = coerce_state(state)

    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(coerced, indent=2))
    os.replace(tmp, p)
    return coerced


def update_state(path: str | Path, updater: Callable[[State], Optional[State]]) -> State:
    """
    Load state, call updater(state) (mutate in place or return a new dict), validate, and save atomically.
    """
    current = load_state(path)
    result = updater(current)
    next_state = result if isinstance(result, Mapping) else current
    return save_state(path, next_state)

