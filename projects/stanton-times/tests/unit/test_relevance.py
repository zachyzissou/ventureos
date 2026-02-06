from src.scoring.relevance import normalize_weights, resolve_draft_threshold, weighted_score


def test_normalize_weights_defaults_and_overrides():
    weights = normalize_weights({"developer_credibility": "0.1", "extra": 0.5})
    assert weights["developer_credibility"] == 0.1
    assert weights["extra"] == 0.5
    # default keys remain present
    assert "technical_depth" in weights


def test_weighted_score():
    components = {"a": 0.5, "b": 1.0}
    weights = {"a": 0.2, "b": 0.3}
    assert weighted_score(components, weights) == 0.5 * 0.2 + 1.0 * 0.3


def test_resolve_draft_threshold_priority_override():
    content = {"priority": "P2"}
    config_ci = {"draft_threshold": 0.7, "priority_thresholds": {"P2": 0.9, "default": 0.7}}
    state_ci = {"draft_threshold": 0.6}
    assert resolve_draft_threshold(content, config_ci, state_ci) == 0.9


def test_resolve_draft_threshold_fallbacks():
    content = {"priority": "P9"}
    config_ci = {"draft_threshold": 0.75, "priority_thresholds": {"default": 0.8}}
    assert resolve_draft_threshold(content, config_ci, {}) == 0.8

