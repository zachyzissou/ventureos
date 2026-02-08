---
id: WI-20260207-2033-work-tracking-protocol
status: doing
created: 2026-02-07T20:33:00-06:00
updated: 2026-02-07T20:40:00-06:00
owner: Zach / OpenClaw
scope: OpenClaw process + workspace documentation
tags: [process, tracking, gitlab]
---

# Work Item — Make OpenClaw work trackable + “fully featured”

## Why (context)
- Zach asked: “Let’s make sure all of the work you’re doing is trackable and fully featured.” (2026-02-07 20:33 CST)

## Definition of Done
- [x] Add a lightweight work-item (“ticket”) system in-repo (file-based)
- [ ] Update methodology so this becomes default behavior
- [ ] Document what I will include in every tracked work item (evidence + verification)
- [ ] Confirm with Zach what “fully featured” means (Plane/GitHub vs file-based) and whether to re-introduce an external tracker

## Plan
1. Create `memory/work-items/` with:
   - `_TEMPLATE.md`
   - `INDEX.md`
2. Extend `memory/METHODOLOGY.md` to require Work Items for non-trivial work.
3. Begin using it immediately (this work item is the first).

## Execution Log
- 2026-02-07 20:39 CST — Created `memory/work-items/` + template + index
- 2026-02-07 20:40 CST — Extended `memory/METHODOLOGY.md` with Work Item requirement

## Evidence / Artifacts
- Files created:
  - `memory/work-items/_TEMPLATE.md`
  - `memory/work-items/INDEX.md`
  - `memory/work-items/WI-20260207-2033-work-tracking-protocol.md`
- Files modified:
  - `memory/METHODOLOGY.md`
  - `memory/2026-02-07.md`

## Verification
- [x] Followed FIND → VALIDATE → FIX → VERIFY (for the scaffolding work)

## Outcome
- A local, searchable (via `memory_search`) work tracking system is now in place.

## Follow-ups
- [ ] Decide GitLab conventions (labels/boards/milestones) for the “dashboard” layer
