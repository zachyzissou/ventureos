from __future__ import annotations

from typing import Any, Dict, Mapping


DEFAULT_SCORING_WEIGHTS: Dict[str, float] = {
    "developer_credibility": 0.4,
    "community_engagement": 0.3,
    "information_novelty": 0.2,
    "technical_depth": 0.1,
}

DEFAULT_DRAFT_THRESHOLD = 0.7

# Used when a config doesn't specify priority overrides.
DEFAULT_PRIORITY_THRESHOLDS: Dict[str, float] = {
    "P0": 0.0,
    "P1": 0.7,
    "P2": 0.8,
    "default": DEFAULT_DRAFT_THRESHOLD,
}


def normalize_weights(weights: Any) -> Dict[str, float]:
    if not isinstance(weights, Mapping):
        return dict(DEFAULT_SCORING_WEIGHTS)

    normalized: Dict[str, float] = dict(DEFAULT_SCORING_WEIGHTS)
    for key, val in weights.items():
        try:
            normalized[str(key)] = float(val)
        except (TypeError, ValueError):
            continue
    return normalized


def weighted_score(components: Mapping[str, float], weights: Mapping[str, float]) -> float:
    score = 0.0
    for key, weight in weights.items():
        try:
            score += float(components.get(key, 0.0)) * float(weight)
        except (TypeError, ValueError):
            continue
    return float(score)


def resolve_draft_threshold(
    content: Mapping[str, Any],
    config_content_intelligence: Mapping[str, Any] | None,
    state_content_intelligence: Mapping[str, Any] | None,
) -> float:
    config_ci = dict(config_content_intelligence or {})
    state_ci = dict(state_content_intelligence or {})

    base_threshold = config_ci.get(
        "draft_threshold",
        state_ci.get("draft_threshold", DEFAULT_DRAFT_THRESHOLD),
    )

    try:
        base_threshold_f = float(base_threshold)
    except (TypeError, ValueError):
        base_threshold_f = float(DEFAULT_DRAFT_THRESHOLD)

    priority_thresholds = config_ci.get("priority_thresholds")
    if not isinstance(priority_thresholds, Mapping):
        priority_thresholds = dict(DEFAULT_PRIORITY_THRESHOLDS)

    priority = str(content.get("priority") or "").upper()
    if priority and priority in priority_thresholds:
        try:
            return float(priority_thresholds[priority])
        except (TypeError, ValueError):
            return base_threshold_f

    default_val = priority_thresholds.get("default", base_threshold_f)
    try:
        return float(default_val)
    except (TypeError, ValueError):
        return base_threshold_f

