# Batch Processing — Framework

## Purpose
Provide a **repeatable, auditable** framework for running large batches (AI factory, content ops, data transforms) with **safe chunking**, **retries**, and **rollback**. The batch system must preserve **mission context**, produce **verifiable artifacts**, and integrate with the **task queue**.

## Goals
- **Reproducibility:** every batch is replayable from a manifest.
- **Safety:** failures are isolated to chunks; rollback is explicit.
- **Auditability:** batch runs produce logs, QA notes, and status records.
- **Scalability:** chunking enables parallelism within caps.
- **Mission alignment:** batch work is first‑class in Mission Control.

## Non‑Goals
- Real‑time streaming pipelines.
- Stateful distributed compute orchestration.

---

## Core Concepts
- **Batch**: a set of items processed with the same pipeline.
- **Batch Manifest**: the canonical spec for the batch (inputs, outputs, chunking, retry policy, QA).
- **Chunk**: deterministic subset of batch items processed as a unit.
- **Item**: smallest unit of work (one asset, record, or prompt).
- **Checkpoint**: durable state after each chunk (status + outputs index).

---

## Batch Manifest (Required)
The manifest is the **single source of truth** for batch execution.

**Location (default):**
```
~/clawd/runtime/batches/<batchId>/manifest.json
```

### Minimal Schema (v1)
```json
{
  "version": 1,
  "batchId": "batch-2026-02-08-assetpack-a",
  "createdAt": "2026-02-08T07:00:00Z",
  "owner": "Synth",
  "issue": "https://slurpnet:9080/zachgonser/ventureos/-/issues/12",

  "mission": {
    "businessUnit": "stanton-times",
    "missionType": "ai-factory",
    "role": "Synth",
    "expectedArtifacts": [
      "/obsidian/StantonTimes/2026/02/batch-manifest.md",
      "/obsidian/StantonTimes/2026/02/batch-qa.md"
    ],
    "requiresApproval": true
  },

  "inputs": {
    "source": "/data/inputs/prompts.csv",
    "dataClass": "internal",
    "constraints": ["seeded", "style-guide:v3"]
  },

  "outputs": {
    "targetDir": "/data/outputs/batch-2026-02-08",
    "naming": "asset-{itemId}.png",
    "indexFile": "outputs-index.jsonl"
  },

  "pipeline": [
    {
      "step": "generate",
      "tool": "glyph",
      "params": {"model": "sdxl", "steps": 30, "seed": 4811}
    },
    {
      "step": "qa",
      "tool": "verifier",
      "params": {"sampleRate": 0.1}
    }
  ],

  "chunking": {
    "strategy": "size",
    "itemsPerChunk": 50,
    "maxConcurrency": 3,
    "deterministicSeed": 1337
  },

  "retryPolicy": {
    "perItemMaxAttempts": 2,
    "perChunkMaxAttempts": 2,
    "backoff": "exponential",
    "retryableErrors": ["timeout", "rate_limit", "transient"]
  },

  "rollback": {
    "mode": "quarantine",
    "deleteOnRollback": false,
    "requiresApproval": true
  },

  "qa": {
    "sampleRate": 0.1,
    "acceptance": ["meets_style", "no_artifacts", "passes_safety"],
    "failFastThreshold": 0.2
  },

  "logging": {
    "statusFile": "batch-status.json",
    "runLog": "batch-runs.jsonl",
    "chunkLog": "chunk-results.jsonl"
  }
}
```

### Required Fields
- `version`, `batchId`, `createdAt`, `owner`
- `mission` (business unit + mission type + role)
- `inputs`, `outputs`, `pipeline`
- `chunking`, `retryPolicy`, `rollback`, `logging`

---

## Validation (Preflight)
**Validation must run before enqueueing any chunk.**

1) **Schema validation**
   - Ensure required fields exist and types match.
2) **Path validation**
   - Inputs exist, outputs directory is writable.
3) **Data‑class gate**
   - Must comply with **GUARDRAILS.md** and data‑class restrictions.
4) **Cost/time estimate**
   - Estimate total items × per‑item cost; block if over **BUDGET_POLICY.md**.
5) **Concurrency caps**
   - Enforce Proactive Engine limits (see **PROACTIVE_ENGINE.md**).
6) **Dry‑run**
   - Optional: sample first chunk with no side‑effects or to a staging directory.

Validation failures **block the batch** and are recorded in `batch-status.json`.

---

## Chunking & Scheduling
Chunking is **deterministic** so a batch can be resumed or replayed.

**Strategies:**
- `size` — fixed items per chunk
- `time` — fixed runtime window per chunk
- `resource` — dynamic based on compute/time budget
- `quality` — chunk size reduces when QA fail rate rises

**Rules:**
- Each chunk has a stable `chunkId` and item list.
- Chunk boundaries must be reproducible (seeded + deterministic ordering).
- Chunk completion writes a checkpoint (status + output index).
- Chunk failures do **not** fail the entire batch until retry policy is exhausted.

---

## Retries
Retries are **explicit** and follow **RETRY_POLICY.md**.

- **Per‑item retries** for transient tool errors.
- **Per‑chunk retries** for pipeline‑level failures.
- Backoff uses exponential + jitter (cap at 1h).
- Non‑retryable errors immediately halt the chunk and mark it failed.

**Escalation:**
- If a chunk exceeds `perChunkMaxAttempts`, the batch moves to `needs_review`.
- The batch cannot be marked complete until all failed chunks are resolved (retry, skip, or rollback).

---

## Rollback
Rollback is **configured in the manifest** and is mandatory for destructive workflows.

**Rollback modes:**
- `quarantine` — mark outputs invalid and move to a quarantine directory.
- `delete` — delete outputs for the affected chunk(s).
- `restore` — restore from a checkpoint or prior snapshot.

**Trigger conditions:**
- QA failure beyond `failFastThreshold`
- Repeated chunk failures beyond retry limits
- Manual cancel or Sentinel block

Rollback actions must be logged in `batch-runs.jsonl` and require approval if destructive.

---

## Integration with Mission Control
Batch processing is a **first‑class mission type** (see **MISSION_CONTROL.md**):

- **Mission Brief** must link the manifest path.
- **Expected artifacts** include:
  - `manifest.json`
  - `chunk-results.jsonl`
  - `batch-qa.md`
  - `rollback-report.md` (if triggered)
- **Sentinel** approves destructive rollback.
- **Verifier** validates QA sampling and completion criteria.

---

## Integration with Task Queue
Each chunk is executed as a **queue item** with batch metadata.

**Queue item extensions (draft):**
```json
{
  "batchId": "batch-2026-02-08-assetpack-a",
  "chunkId": "chunk-03",
  "batchStage": "generate",
  "manifestPath": "~/clawd/runtime/batches/batch-2026-02-08-assetpack-a/manifest.json",
  "itemRange": "101-150",
  "dedupeKey": "batch-2026-02-08-assetpack-a:chunk-03"
}
```

**Worker behavior:**
- Load manifest once per chunk.
- Update `batch-status.json` after each chunk.
- Write per‑chunk outcomes to `chunk-results.jsonl`.
- Requeue failed chunks within retry policy.
- If batch enters `needs_review`, stop scheduling new chunks.

---

## Completion Criteria
A batch is **complete** when:
- All chunks are `complete` or explicitly `skipped` with approval.
- QA sampling passes acceptance thresholds.
- Required artifacts are present and linked.
- Mission Control gates (Sentinel + Verifier) are satisfied.

---

## Required Artifacts
- `manifest.json`
- `batch-status.json`
- `chunk-results.jsonl`
- `batch-qa.md`
- `rollback-report.md` (if applicable)

---

## Notes
This framework is intended to be implemented by **Synth + Toolsmith** and tracked in the task queue for auditability.
