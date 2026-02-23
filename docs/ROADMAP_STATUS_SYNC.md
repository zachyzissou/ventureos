# Roadmap Status Sync Workflow

Purpose: keep active status pointers in `README.md` aligned with the roadmap anchor issue [#138](https://github.com/zachyzissou/ventureos/issues/138).

## Authoritative Rules

1. `README.md` section `### Now (active)` and issue `#138` section `## Now (Active)` must list the same issue IDs.
2. Issue IDs listed in active `Now` sections must be `OPEN`.
3. `README.md` must reference roadmap anchor issue `#138`.

## Drift Check Command

```bash
npm run roadmap:sync:check
```

The command prints a structured report and exits non-zero on mismatch.

## Maintainer Update Flow

1. Update issue `#138` (`Now`/`Next`) to reflect the active queue.
2. Update `README.md` `### Now (active)` to the same issue set.
3. Run:
   - `npm run roadmap:sync:check`
4. If drift is reported, resolve mismatches and rerun before merge.

## Regression Test

```bash
npm run test:roadmap:sync:check
```
