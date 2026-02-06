# Stanton Times Pipeline

## End-to-end Flow
1. **Ingest sources**
   - RSS/YouTube: `src/source_monitor.py`
   - X/Twitter (bird CLI): `bird_monitor.py`

2. **Normalize + Score**
   - `content_processor.py` scores each item (local logic mode by default).
   - P0 always drafts; P1/P2 require thresholds.

3. **Ledger + Clustering**
   - `ledger.py` writes every item to SQLite.
   - Items are grouped into **clusters** (same event/story).
   - **Cluster cooldown** prevents repeated drafts for the same news.

4. **Draft creation**
   - Drafts are created only when score ≥ threshold + quota not exceeded.
   - Drafts are stored in `data/state.json` and the ledger.

5. **Approval**
   - Discord approval via webhook + reactions.
   - `reaction_monitor.py` updates ledger status on approve/reject/edit.

6. **Publish**
   - `tweet_publisher.py` posts via `bird-auth.sh`.
   - Ledger updated with tweet_id.

## Approval Flow (Draft Status)

Stories in `data/state.json` move through:

- `needs_review`: draft created locally, not yet posted to Discord
- `posted_for_review`: embed posted to Discord (has `discord_message_id`)
- `approved`: community approved (✅)
- `rejected`: community rejected (❌) or auto-rejected after max age
- `hold`: community marked hold (🤔)
- `edit_requested`: community requested edits (✏️), then bot waits for an `EDIT: ...` message
- `published`: tweet posted, story marked published with `tweet_id`

## Local Run

Recommended entrypoint:

```bash
./.venv/bin/python src/app.py monitor
./.venv/bin/python src/app.py verify
./.venv/bin/python src/app.py react
./.venv/bin/python src/app.py publish
```

Scheduling:

- OpenClaw cron: `docs/OPENCLAW_CRON.md`

## Key Inputs
- `config/config.json` (sources, thresholds, cadence)
- `~/.credentials/stanton_times_discord_webhook`
- `~/.credentials/stanton_times_discord_bot_token`

## Key Outputs
- Drafts: `data/state.json`
- Ledger: `data/stanton_times_ledger.sqlite`
- Digest: `reports/digests/YYYY-MM-DD.md`
