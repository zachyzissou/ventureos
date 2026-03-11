# Token Compaction Pipeline

Issue: #221

## Purpose

`lib/token-compactor.ts` provides deterministic, zero-LLM context compression for workspace file payloads before prompt assembly.

Primary goals:
- reduce prompt token load by 50%+ at `standard` level
- keep protected files unmodified
- complete inside a bounded processing window (`maxProcessingMs`, default `200ms`)

## Layers

The pipeline applies 5 ordered layers:

1. `whitespace-normalization`
2. `comment-stripping`
3. `deduplication` (cross-file repeated block removal)
4. `abbreviation` (bundle metadata shortening)
5. `priority-pruning` (drops low-score context first)

## Levels

- `conservative` → target `50%` reduction
- `standard` → target `70%` reduction
- `aggressive` → target `90%` reduction

Targets are best-effort; protected/non-text content and minimum retention floors can reduce achievable savings.

## Protected Files

Default protected globs:

- `SOUL.md`
- `PRINCIPLES.md`
- `*.key`

Protected files are passed through byte-for-byte and flagged with `skippedReason: "protected-file-pattern"`.

## Metrics

Each run returns:

- `preTokens` / `postTokens`
- `compressionRatio`
- `reductionPct` and `targetReductionPct`
- `layerContributions[]` (`preTokens`, `postTokens`, `savedTokens`, `savedPct` per layer)
- `estimatedSavingsUsd`
- `timedOut` when processing budget is exceeded

The dashboard route `POST /api/token-compaction/run` persists metrics to `dashboard/data/token-compaction-metrics.json`, and `GET /api/token-compaction/metrics` provides per-session summaries.

## Benchmark Harness

Run a local benchmark over a representative workspace:

```bash
npm run bench:token-compaction -- /path/to/workspace 300
```

Arguments:
- `workspacePath` (optional, default current directory)
- `maxFiles` (optional, default `200`, range `10..2000`)

