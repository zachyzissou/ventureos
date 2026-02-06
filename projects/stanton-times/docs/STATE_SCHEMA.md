# `data/state.json` Schema

The state file is validated and normalized by `src/state/store.py` on load/save.

## Top-Level Keys (Expected)

- `content_intelligence` (object)
  - `scoring_weights` (object: string keys, float values)
  - `draft_threshold` (float)
- `pending_stories` (array)
- `seen_tweet_ids` (object)
- `last_checked` (object)
- `processed_sources` (object)

## Notes

- Unknown keys are preserved (legacy migrations may keep `ops`, etc).
- Type mismatches for known keys raise `StateValidationError`.
- Saving is atomic (`*.tmp` then `os.replace`) to reduce corruption risk.

