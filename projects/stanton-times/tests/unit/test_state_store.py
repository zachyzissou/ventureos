import json

import pytest

from src.state.store import StateValidationError, load_state, save_state, update_state


def test_save_and_load_state_roundtrip(tmp_path):
    path = tmp_path / "state.json"
    state = save_state(path, {"pending_stories": []})
    loaded = load_state(path)
    assert loaded["pending_stories"] == []
    assert "content_intelligence" in loaded
    assert "last_checked" in loaded
    assert state["content_intelligence"]["draft_threshold"] == loaded["content_intelligence"]["draft_threshold"]


def test_load_state_invalid_raises(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("not json")
    with pytest.raises(json.JSONDecodeError):
        load_state(path, create_if_missing=False)


def test_coerce_rejects_wrong_types(tmp_path):
    path = tmp_path / "state.json"
    path.write_text(json.dumps({"pending_stories": {}}))
    with pytest.raises(StateValidationError):
        load_state(path, create_if_missing=False)


def test_update_state_appends(tmp_path):
    path = tmp_path / "state.json"
    save_state(path, {"pending_stories": []})

    def upd(state):
        state["pending_stories"].append({"topic": "x"})

    st = update_state(path, upd)
    assert st["pending_stories"][0]["topic"] == "x"


def test_state_coercion_preserves_unknown_keys(tmp_path):
    path = tmp_path / "state.json"
    save_state(path, {"ops": {"notes": "keep me"}, "pending_stories": []})
    loaded = load_state(path)
    assert loaded["ops"]["notes"] == "keep me"
