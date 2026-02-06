# Discord Approvals

This project uses a Discord webhook + reactions to approve/reject drafts before publishing.

## Components

- Webhook payload + reaction seeding: `src/utils/discord_approval.py`, `src/notify/discord_webhook.py`
- Approval job (cron): `./.venv/bin/python src/app.py verify`
- Reaction monitor (long-running bot): `./.venv/bin/python src/app.py react`

## Draft Status Flow

Stories in `data/state.json` move through:

- `needs_review`: draft exists locally but has not been posted to Discord
- `posted_for_review`: embed posted to Discord (typically has `discord_message_id`)
- `approved`: community approved (✅)
- `rejected`: community rejected (❌) or auto-rejected after max age
- `hold`: community marked hold (🤔)
- `edit_requested`: community requested edits (✏️); bot prompts for `EDIT: ...`
- `published`: tweet posted (has `tweet_id`)

## Edit Flow

1. React ✏️ on the embed to mark `edit_requested`.
2. Reply in the verification channel with:
   - `EDIT: <new tweet text>`
3. The bot updates the draft, re-posts it for review, and sets `posted_for_review`.

## Local Run

```bash
./.venv/bin/python src/app.py monitor
./.venv/bin/python src/app.py verify
./.venv/bin/python src/app.py react
./.venv/bin/python src/app.py publish
```
