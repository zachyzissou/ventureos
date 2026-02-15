# Business Units — Registry Schema & Operating Rules

> **Registry file:** `~/clawd/runtime/business-units.json`  
> **Schema version:** 2  
> **Last updated:** 2026-02-15

A **Business Unit** is a named, durable container that makes VentureOS scalable. Instead of "one giant assistant that does everything," we maintain discrete units with their own goals, repos, risk posture, and automations.

---

## Registry Location

| File | Purpose |
|---|---|
| `~/clawd/runtime/business-units.json` | **Runtime source of truth** — agents read this at mission-planning time |
| `~/clawd/ventureos/docs/BUSINESS_UNITS.md` | This file — schema docs and operating rules |

---

## JSON Schema (v2)

### Top-level envelope

```jsonc
{
  "$schema": "https://ventureos.dev/schemas/business-units-v2.json",
  "version": 2,                    // Schema version (integer)
  "generated_at": "ISO-8601",      // Last generation/update timestamp
  "units": [ /* ... */ ],          // Array of BusinessUnit objects
  "categories": { /* ... */ },     // Category id → description map
  "priorities": { /* ... */ }      // Priority level → description map
}
```

### BusinessUnit object

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Stable slug identifier (kebab-case). Never changes once assigned. |
| `name` | `string` | ✅ | Human-readable display name. |
| `description` | `string` | ✅ | One-liner describing purpose and scope. |
| `category` | `enum` | ✅ | One of: `infra`, `game`, `app`, `media`, `personal`. |
| `priority` | `enum` | ✅ | One of: `critical`, `high`, `medium`, `low`. |
| `status` | `enum` | ✅ | One of: `active`, `paused`, `archived`. |
| `obsidianPath` | `string` | ✅ | Relative path inside `~/Obsidian/VaultZap/`. |
| `obsidianUri` | `string` | ⬚ | Full `obsidian://` deep-link URI. |
| `github` | `string\|null` | ✅ | Primary GitHub repo as `owner/repo`, or `null` if none. |
| `repos` | `Repo[]` | ✅ | Array of associated repositories (may be empty). |
| `contacts` | `Contact[]` | ✅ | Array of relevant contacts (may be empty). |
| `tags` | `string[]` | ✅ | Freeform tags for filtering and search. |
| `owner_role` | `string` | ✅ | VentureOS role responsible (e.g., `Helmsman`, `Producer`). |
| `risk` | `Risk` | ✅ | Approval requirements for sensitive actions. |
| `automations` | `Automation[]` | ✅ | Registered automations (cron, monitors, pipelines). |
| `missionTypes` | `string[]` | ✅ | Valid mission types: `build`, `ops`, `infra`, `content`, `research`. |
| `cadence` | `string` | ✅ | Review cadence: `daily`, `weekly`, `monthly`, `quarterly`. |

### Repo object

```jsonc
{
  "name": "ventureos",                                   // Repo name
  "url": "https://github.com/zachyzissou/ventureos",     // Full URL
  "visibility": "private",                                // public | private
  "note": "optional context"                              // Optional description
}
```

### Risk object

```jsonc
{
  "external_publish_requires_approval": true,   // Publishing to external platforms
  "destructive_actions_requires_approval": true, // Deletes, drops, irreversible changes
  "config_changes_requires_approval": true       // Config/infra modifications
}
```

### Automation object

```jsonc
{
  "kind": "cron",                    // cron | monitor | tbd
  "name": "memory-observation-sync", // Stable name for the automation
  "schedule": "hourly"               // Human-readable schedule (optional)
}
```

---

## Categories

| ID | Description |
|---|---|
| `infra` | Infrastructure, DevOps, AI/ML pipelines |
| `game` | Game development projects |
| `app` | Applications and tooling |
| `media` | Content creation and publishing |
| `personal` | Personal systems and productivity |

## Priority Levels

| Level | Meaning |
|---|---|
| `critical` | Core infrastructure — failures block everything |
| `high` | Active projects with regular deliverables |
| `medium` | Important but lower urgency |
| `low` | Nice-to-have, background work |

---

## Current Registry (9 units)

| ID | Name | Category | Priority | GitHub | Obsidian |
|---|---|---|---|---|---|
| `ventureos` | VentureOS | infra | critical | `zachyzissou/ventureos` ✅ | `🔧 Projects/VentureOS` ✅ |
| `bloom` | Bloom | game | high | `zachyzissou/Bloom` ✅ | `🔧 Projects/Bloom` ✅ |
| `jav-library` | jav-library | app | medium | `zachyzissou/jav-library` ✅ | `🔧 Projects/jav-library` ✅ |
| `home-automation` | Home Automation | infra | medium | — | `🔧 Projects/Home Automation` ✅ |
| `personal-productivity` | Personal Productivity | personal | medium | — | `🔧 Projects/Personal Productivity` ✅ |
| `stantontimes-network` | StantonTimes Network | media | high | `zachyzissou/stanton-times` ✅ | `🔧 Projects/TheStantonTimes` ✅ |
| `low-noise-studios` | Low Noise Studios | game | medium | — | `🔧 Projects/Low Noise` ✅ |
| `fotopress` | FotoPress | app | low | `zachyzissou/fotopress-website` ✅ | `🔧 Projects/FotoPress` ✅ |
| `storyteller-suite` | StorytellerSuite | app | low | — | `🔧 Projects/StorytellerSuite` ✅ |

### Validation Summary
- **Obsidian paths:** 9/9 validated ✅ (all directories exist in `~/Obsidian/VaultZap/`)
- **GitHub repos:** 5/9 linked ✅ (4 units have no dedicated repo — that's fine)
- **GitHub repos verified via `gh` CLI** — all linked repos confirmed to exist

---

## Multi-account Pattern (StantonTimes network)

Treat each account as:
- A **Business Unit** (for fully independent brands), or
- A **Unit Instance** inside a parent network (when sharing policy + tooling)

Recommended approach:
- **Parent unit:** `stantontimes-network`
- **Child units:** `stantontimes-sc`, `stantontimes-bloom`, `stantontimes-dev`, etc.

Each child isolates: state files, source lists, brand voice constraints, approval routing.

---

## How Business Units Integrate with Missions

When a job is enqueued or a mission is planned, it carries:
- `businessUnit` — registry id
- `missionType` — one of the unit's allowed `missionTypes`
- `role` — virtual role running the task

This makes logs searchable by unit, alert routing predictable, and quality gates enforceable per unit.

---

## Adding a New Business Unit

1. Create Obsidian folder: `~/Obsidian/VaultZap/🔧 Projects/<Name>/`
2. Add entry to `~/clawd/runtime/business-units.json`
3. Validate: `jq '.units[] | .id' ~/clawd/runtime/business-units.json` (all ids unique)
4. If GitHub repo exists, add to `repos[]` array
5. Update the registry table in this document
6. Commit both files to `ventureos` repo

## Removing / Archiving a Business Unit

1. Set `"status": "archived"` — do not delete the entry
2. Update this document
3. Commit
