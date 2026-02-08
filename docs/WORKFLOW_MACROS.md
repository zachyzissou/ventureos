# Workflow Macros (Reusable Workflow Recipes)

## Purpose
Workflow macros are **reusable, versioned step blocks** that power higher‑level workflows and mission runners. They define **inputs**, **prechecks**, **approvals**, **steps**, and **outputs** in a portable YAML/JSON format so repeated operations are safe, auditable, and consistent.

Macros are **building blocks** (not user‑facing commands). Workflow commands may call one or more macros to avoid duplicating logic.

---

## Storage & Discovery

**Canonical (versioned) macros:**
- `docs/workflow-macros/*.macro.yaml` or `*.macro.json`

**Local / runtime overrides (operator‑specific):**
- `~/clawd/runtime/workflows/macros/*.macro.yaml` or `*.macro.json`

**Search order (highest priority first):**
1. `~/clawd/runtime/workflows/macros/`
2. `docs/workflow-macros/`

If a runtime override shadows a repo macro, the run log must note the override path.

---

## Naming & Versioning
- **Name:** `namespace.action` (example: `backup.create`, `docs.lint`)
- **Version:** integer schema version (increment on breaking changes)
- **File name:** `<name>.macro.yaml` or `<name>.macro.json`

---

## Macro Schema (YAML)

```yaml
version: 1
name: backup.create
description: Create and verify an OpenClaw backup.
tags: [ops, backup]
owner: ops

inputs:
  output_dir:
    type: path
    description: Directory for backup artifacts.
    required: false
    default: "~/backups/clawd"
  verify:
    type: boolean
    description: Run verify after backup.
    required: false
    default: true

prechecks:
  - id: guardrails
    type: guardrails
  - id: budget
    type: budget
    maxUsd: 2
  - id: data_class
    type: data_class
    value: internal
  - id: side_effects
    type: side_effects
    value: reversible
  - id: openclaw_cli
    type: shell
    command: "command -v openclaw"
    expect: "exit:0"

approvals:
  required: false
  reason: "Reversible, no config change."
  gates:
    - type: cli_flag
      flag: "--approve"
    - type: issue_link
      flag: "--issue"

steps:
  - id: create
    type: shell
    command: "scripts/backup-clawd.sh --output {{output_dir}}"
    timeoutSeconds: 1800
    maxAttempts: 2
    onError: retry
  - id: verify
    type: shell
    when: "{{verify}}"
    command: "scripts/verify-backup.sh --dir {{output_dir}}"
    timeoutSeconds: 600
    maxAttempts: 1
    onError: abort

outputs:
  - id: archive
    type: artifact
    path: "{{output_dir}}/clawd-{{date}}.tar.gz"
    required: true
  - id: checksum
    type: artifact
    path: "{{output_dir}}/clawd-{{date}}.tar.gz.sha256"
    required: true
```

---

## JSON Equivalent (Skeleton)

```json
{
  "version": 1,
  "name": "backup.create",
  "description": "Create and verify an OpenClaw backup.",
  "tags": ["ops", "backup"],
  "owner": "ops",
  "inputs": {
    "output_dir": {
      "type": "path",
      "description": "Directory for backup artifacts.",
      "required": false,
      "default": "~/backups/clawd"
    },
    "verify": {
      "type": "boolean",
      "description": "Run verify after backup.",
      "required": false,
      "default": true
    }
  },
  "prechecks": [
    {"id": "guardrails", "type": "guardrails"},
    {"id": "budget", "type": "budget", "maxUsd": 2},
    {"id": "data_class", "type": "data_class", "value": "internal"},
    {"id": "side_effects", "type": "side_effects", "value": "reversible"}
  ],
  "approvals": {
    "required": false,
    "reason": "Reversible, no config change.",
    "gates": [
      {"type": "cli_flag", "flag": "--approve"},
      {"type": "issue_link", "flag": "--issue"}
    ]
  },
  "steps": [
    {
      "id": "create",
      "type": "shell",
      "command": "scripts/backup-clawd.sh --output {{output_dir}}",
      "timeoutSeconds": 1800,
      "maxAttempts": 2,
      "onError": "retry"
    }
  ],
  "outputs": [
    {
      "id": "archive",
      "type": "artifact",
      "path": "{{output_dir}}/clawd-{{date}}.tar.gz",
      "required": true
    }
  ]
}
```

---

## Inputs
- Inputs are **typed** and **validated** before execution.
- Supported types (minimum set): `string`, `number`, `boolean`, `path`, `enum`, `json`.
- Optional constraints: `required`, `default`, `enum`, `pattern`, `min`, `max`, `secret`.

Inputs are referenced using `{{input_name}}` templating in commands and conditions.

---

## Prechecks
Prechecks are **hard gates** that run before any steps.

**Standard precheck types:**
- `guardrails` → must comply with **GUARDRAILS.md**
- `budget` → enforce **BUDGET_POLICY.md** thresholds
- `data_class` → `public | internal | confidential | restricted`
- `side_effects` → `read_only | reversible | destructive`
- `config_change` → explicit flag when touching configs
- `dependency` → verify required binaries/services
- `shell` → run a shell command and assert `exit:0` or output match

If any precheck fails, the macro **aborts** with a clear error.

---

## Approvals
Approvals are enforced **after prechecks** and **before steps**. They are required for:
- **destructive** or **config‑changing** macros
- **external publish** or irreversible actions

Approval gates may include:
- `cli_flag` (e.g., `--approve`)
- `issue_link` (require `--issue`)
- `manual_ack` (explicit confirmation in UI)

---

## Steps
Steps execute **sequentially** unless explicitly marked parallel (future).

**Minimum step fields:**
- `id` (unique within macro)
- `type` (`shell`, `macro`, `workflow`, `manual`, `noop`)
- `command` or `call` (depending on type)

**Optional fields:**
- `when` → conditional expression (`{{input}}` templating)
- `timeoutSeconds`
- `maxAttempts`
- `onError`: `abort | retry | continue`
- `cwd`, `env`

Macro steps should prefer the standard wrapper:
```
scripts/guarded-run.sh <timeout> <max_attempts> <base_sleep> <command...>
```

---

## Execution Semantics
1. **Resolve macro** from search paths.
2. **Validate schema** and input types.
3. **Apply inputs**: defaults → CLI overrides.
4. **Run prechecks** in order; abort on failure.
5. **Enforce approvals** (if required).
6. **Execute steps** sequentially with retry/timeout policy.
7. **Record outputs + logs** (artifact paths, step status, errors).

**Safety rules:**
- Non‑idempotent or destructive steps must declare `side_effects: destructive` and require approval.
- Macros may call other macros, but **cycles are not allowed** (max depth recommended: 3).

---

## Relationship to Workflow Commands
Workflow commands should **compose macros** instead of duplicating multi‑step logic. See **WORKFLOW_COMMANDS.md** for the operator‑facing catalog and CLI patterns.
