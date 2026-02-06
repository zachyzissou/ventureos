import os
import pytest
import requests

TOKEN_PATH = "/Users/zachgonser/.credentials/stanton_times_discord_token"

if os.getenv("RUN_DISCORD_TOKEN_TEST") != "1":
    pytest.skip("Discord token test is opt-in. Set RUN_DISCORD_TOKEN_TEST=1 to run.", allow_module_level=True)


def test_discord_token():
    if not os.path.exists(TOKEN_PATH):
        pytest.skip(f"Token file missing: {TOKEN_PATH}", allow_module_level=True)

    with open(TOKEN_PATH, "r") as f:
        token = f.read().strip()

    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    }

    response = requests.get("https://discord.com/api/v10/users/@me", headers=headers, timeout=10)

    assert response.status_code == 200
