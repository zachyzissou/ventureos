import os
from pathlib import Path

import pytest
import requests

TOKEN_PATH = Path(
    os.getenv(
        "STANTON_TIMES_DISCORD_BOT_TOKEN_FILE",
        str(Path.home() / ".credentials" / "stanton_times_discord_bot_token"),
    )
)

if os.getenv("RUN_DISCORD_TOKEN_TEST") != "1":
    pytest.skip("Discord token test is opt-in. Set RUN_DISCORD_TOKEN_TEST=1 to run.", allow_module_level=True)


def test_discord_token():
    if not TOKEN_PATH.exists():
        pytest.skip(f"Token file missing: {TOKEN_PATH}", allow_module_level=True)

    token = TOKEN_PATH.read_text().strip()

    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    }

    response = requests.get("https://discord.com/api/v10/users/@me", headers=headers, timeout=10)

    assert response.status_code == 200
