# Stanton Times — Star Citizen Newsroom Pipeline

## Overview
Automated news monitoring + drafting pipeline for @TheStantonTimes. Sources are ingested, deduped, clustered, scored, drafted, and posted for Discord approval before publishing to X.

## Key Docs
- `docs/PIPELINE.md`
- `docs/OPERATIONS.md`
- `docs/SOURCES.md`
- `docs/OPENCLAW_CRON.md`

## Project Structure
```
config/     # config.json (sources + thresholds)
data/       # state.json + ledger sqlite
logs/       # runtime logs
scripts/    # maintenance + tools
reports/    # daily digests + dashboard
archives/   # stale draft archives
src/        # core pipeline
```

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Config
- `config/config.json`
- Discord webhook/bot token in `~/.credentials/`

## Run (manual)
```bash
./.venv/bin/python src/app.py monitor
./.venv/bin/python src/app.py verify
./.venv/bin/python src/app.py react
./.venv/bin/python src/app.py publish
./.venv/bin/python src/app.py cleanup
```

## Scheduling

- Recommended: OpenClaw cron (monitor/approval-send/publish)
  - Docs: `docs/OPENCLAW_CRON.md`
  - Example installer: `config/openclaw_cron.example.sh`
- Legacy: `cron_manager.py` (deprecated; kept for backwards compatibility)

## Testing
```bash
pytest tests/
```
