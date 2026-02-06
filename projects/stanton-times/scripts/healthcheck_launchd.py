#!/usr/bin/env python3
import json
import os
import subprocess
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
STATE_PATH = LOG_DIR / "healthcheck_state.json"
LOG_PATH = LOG_DIR / "healthcheck.log"

# Alert suppression window (seconds)
ALERT_SUPPRESS_WINDOW = 30 * 60

JOBS = [
    {
        "label": "com.stantontimes.reaction-monitor",
        "name": "Reaction Monitor"
    },
    {
        "label": "com.stantontimes.discord-verifier",
        "name": "Discord Verifier"
    }
]


def _log(message: str):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {message}\n")


def _load_state():
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception:
            return {}
    return {}


def _save_state(state):
    STATE_PATH.write_text(json.dumps(state, indent=2))


def _launchctl_target(label: str) -> str:
    uid = os.getuid()
    return f"gui/{uid}/{label}"


def _job_running(label: str) -> bool:
    target = _launchctl_target(label)
    res = subprocess.run(["launchctl", "print", target], capture_output=True, text=True)
    if res.returncode != 0:
        return False
    return "state = running" in res.stdout


def _kickstart(label: str) -> bool:
    target = _launchctl_target(label)
    res = subprocess.run(["launchctl", "kickstart", "-k", target], capture_output=True, text=True)
    return res.returncode == 0


def _send_alert(name: str, label: str, restarted: bool):
    title = "Stanton Times Bot Health Alert"
    status = "Restarted" if restarted else "Restart failed"
    description = f"{name} ({label}) was not running. {status} attempted."

    # Use the Stanton Times webhook embed script
    cmd = [
        "node",
        str(PROJECT_ROOT / "send-embed.mjs"),
        "--title", title,
        "--description", description
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        _log(f"Alert sent for {label}: {status}")
    except Exception as e:
        _log(f"Failed to send alert for {label}: {e}")


def main():
    state = _load_state()
    now = time.time()

    for job in JOBS:
        label = job["label"]
        name = job["name"]
        running = _job_running(label)

        if running:
            continue

        restarted = _kickstart(label)
        last_alert = state.get(label, 0)
        if now - last_alert >= ALERT_SUPPRESS_WINDOW:
            _send_alert(name, label, restarted)
            state[label] = now
        else:
            _log(f"Suppressed alert for {label} (recent alert sent).")

    _save_state(state)


if __name__ == "__main__":
    main()
