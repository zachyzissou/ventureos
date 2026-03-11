# Crash Recovery & Active Task Tracking (Issue #223)

## Overview

VentureOS now maintains a markdown "save game" file at `memory/active-tasks.md` that mirrors in-progress Task Board work.

This enables:
- human-readable active task visibility
- stale task detection
- restart recovery that re-queues running work

## File Lifecycle

- Source of truth: `data/task-board.json`
- Tracker mirror: `memory/active-tasks.md`
- Sync trigger: every Task Board mutation (create/update/delete/batch/pipeline/heartbeat/retry)

The tracker is generated with two sections:
- `## Active Tasks` (`RUNNING`, `QUEUED`, `BLOCKED`, `REVIEW`)
- `## Recently Completed` (`DONE`, `FAILED`)

## Recovery Behavior

- On dashboard startup, recovery runs automatically:
  - reads `memory/active-tasks.md`
  - finds running task IDs
  - re-queues matching `running` cards so heartbeat workers can resume
- Recovery appends task status history entries with actor `recovery`

## APIs

- `GET /api/task-board/active`
  - returns active-task snapshot + stale detection
- `POST /api/task-board/recovery/resume`
  - manually triggers recovery re-queue (supports `agentId` + `limit`)

## Stale Detection

Default stale threshold is 30 minutes (`1800000ms`).

- configurable per request via `staleAfterMs`
- stale tasks are ranked by longest time since last update
