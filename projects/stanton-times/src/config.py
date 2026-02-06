import json
import os
from pathlib import Path
from typing import Any, Dict

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config" / "config.json"
DEFAULT_STATE_PATH = PROJECT_ROOT / "data" / "state.json"
DEFAULT_LOG_DIR = PROJECT_ROOT / "logs"
DEFAULT_ARCHIVE_DIR = PROJECT_ROOT / "archives"
DEFAULT_METRICS_DIR = PROJECT_ROOT / "metrics"
DEFAULT_ML_MODELS_DIR = PROJECT_ROOT / "ml_models"
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "stanton_times_ledger.sqlite"
DEFAULT_CREDENTIALS_DIR = Path.home() / ".credentials"

# Environment variable conventions
ENV_CONFIG_PATH = "STANTON_TIMES_CONFIG_PATH"
ENV_STATE_PATH = "STANTON_TIMES_STATE_PATH"
ENV_DB_PATH = "STANTON_TIMES_DB_PATH"
ENV_WEBHOOK_URL = "STANTON_TIMES_DISCORD_WEBHOOK_URL"
ENV_WEBHOOK_FILE = "STANTON_TIMES_DISCORD_WEBHOOK_FILE"
ENV_BOT_TOKEN = "STANTON_TIMES_DISCORD_BOT_TOKEN"
ENV_BIRD_AUTH_SCRIPT = "STANTON_TIMES_BIRD_AUTH_SCRIPT"
ENV_SEND_EMBED_SCRIPT = "STANTON_TIMES_SEND_EMBED_SCRIPT"

DEFAULT_STATE_TEMPLATE: Dict[str, Any] = {
    "content_intelligence": {
        "scoring_weights": {
            "developer_credibility": 0.4,
            "community_engagement": 0.3,
            "information_novelty": 0.2,
            "technical_depth": 0.1
        },
        "draft_threshold": 0.7
    },
    "pending_stories": [],
    "seen_tweet_ids": {},
    "last_checked": {},
    "processed_sources": {},
}


def get_config_path() -> Path:
    return Path(os.getenv(ENV_CONFIG_PATH, DEFAULT_CONFIG_PATH))


def get_state_path() -> Path:
    return Path(os.getenv(ENV_STATE_PATH, DEFAULT_STATE_PATH))


def get_db_path() -> Path:
    return Path(os.getenv(ENV_DB_PATH, DEFAULT_DB_PATH))


def ensure_state_file() -> Path:
    state_path = get_state_path()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    if not state_path.exists():
        state_path.write_text(json.dumps(DEFAULT_STATE_TEMPLATE, indent=2))
    return state_path


def _read_webhook_from_file() -> str:
    webhook_file = os.getenv(ENV_WEBHOOK_FILE, str(DEFAULT_CREDENTIALS_DIR / "stanton_times_discord_webhook"))
    path = Path(webhook_file)
    if path.exists():
        return path.read_text().strip()
    return ""


def _read_bot_token_from_file() -> str:
    token_file = os.getenv(
        "STANTON_TIMES_DISCORD_BOT_TOKEN_FILE",
        str(DEFAULT_CREDENTIALS_DIR / "stanton_times_discord_bot_token")
    )
    path = Path(token_file)
    if path.exists():
        return path.read_text().strip()
    return ""


def _apply_secret_overrides(config: Dict[str, Any]) -> Dict[str, Any]:
    discord_cfg = config.setdefault("discord", {})

    webhook_url = os.getenv(ENV_WEBHOOK_URL) or _read_webhook_from_file()
    if webhook_url:
        discord_cfg["webhook_url"] = webhook_url

    bot_token = os.getenv(ENV_BOT_TOKEN) or _read_bot_token_from_file()
    if bot_token:
        discord_cfg["bot_token"] = bot_token

    return config


def load_config() -> Dict[str, Any]:
    config_path = get_config_path()
    if not config_path.exists():
        legacy_path = PROJECT_ROOT / "config.json"
        if legacy_path.exists():
            config_path = legacy_path
        else:
            raise FileNotFoundError(f"Config file not found at {config_path}")

    with open(config_path, "r") as f:
        config = json.load(f)

    return _apply_secret_overrides(config)


def get_log_path(filename: str) -> str:
    DEFAULT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    return str(DEFAULT_LOG_DIR / filename)


def get_metrics_path(filename: str) -> str:
    return str(DEFAULT_METRICS_DIR / filename)


def get_ml_model_path(filename: str) -> str:
    return str(DEFAULT_ML_MODELS_DIR / filename)


def get_bird_auth_script() -> str:
    """
    Path to the bird authentication wrapper script.

    Prefer STANTON_TIMES_BIRD_AUTH_SCRIPT. If a repo-local `scripts/bird-auth.sh`
    exists, use that. Otherwise fall back to `bird-auth.sh` and rely on PATH.
    """
    env = os.getenv(ENV_BIRD_AUTH_SCRIPT, "").strip()
    if env:
        return env

    candidate = PROJECT_ROOT / "scripts" / "bird-auth.sh"
    if candidate.exists():
        return str(candidate)

    return "bird-auth.sh"


def get_send_embed_script() -> str:
    """
    Node script that posts a Discord embed (used for publish confirmations).
    """
    env = os.getenv(ENV_SEND_EMBED_SCRIPT, "").strip()
    if env:
        return env

    candidate = PROJECT_ROOT / "send-embed.mjs"
    if candidate.exists():
        return str(candidate)

    return "send-embed.mjs"
