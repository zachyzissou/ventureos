# Self-Improvement Digest

Issue: #222

## Overview

The self-improvement system creates a daily digest for each agent with actionable, diffable recommendations.

Core behavior:
- generate digest content in `memory/self-improvement/YYYY-MM-DD.md`
- persist digest + recommendation state in `dashboard/data/self-improvement-digests.json`
- require explicit approval before any file edits
- auto-apply approved recommendations only when target paths are inside the agent's allowed scope

## Data Model

Each digest record stores:
- `id`, `agentId`, `date`, `digestContent`
- `recommendations[]`
- `approvedCount`, `rejectedCount`, `pendingCount`
- source metrics (`failureRate`, `avgRuntimeMs`, etc.)

Each recommendation stores:
- `id`, `digestId`
- `type`: `soul_edit|skill_add|skill_config|memory_restructure|workflow_change`
- `target`, `currentValue`, `proposedValue`, `diff`, `rationale`
- `status`: `pending|approved|rejected|applied`

## API

- `POST /api/self-improvement/generate`
- `GET /api/self-improvement/digests`
- `GET /api/self-improvement/digests/:id`
- `POST /api/self-improvement/recommendations/:id/approve`
- `POST /api/self-improvement/recommendations/:id/reject`

## Security Scope

Approval auto-apply is path-restricted:
- allowed: `souls/<agentId>/**`
- allowed: `memory/self-improvement/**`
- denied: any path outside those roots

If a recommendation targets an out-of-scope path, approval fails and no file mutation is applied.

