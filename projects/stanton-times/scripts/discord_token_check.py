import os
import requests


def verify_discord_bot_token(token: str) -> None:
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    }
    resp = requests.get("https://discord.com/api/v10/users/@me", headers=headers, timeout=10)
    print(f"Status Code: {resp.status_code}")
    print(f"Response: {resp.text}")


def main() -> None:
    token = os.getenv("STANTON_TIMES_DISCORD_BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("Set STANTON_TIMES_DISCORD_BOT_TOKEN to run this check.")
    verify_discord_bot_token(token)


if __name__ == "__main__":
    main()

