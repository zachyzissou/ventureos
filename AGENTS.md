{
    "commands": {
        "restart": true,
        "native": "auto"
    },
    "models": {
        "default": "anthropic/claude-sonnet-4-5"
    },
    "tools": {
        "web": {
            "search": {
                "apiKey": "BSAW1ZNoEGBXmYuZhy_o2MaRfx8yctI"
            }
        },
        "memory": {
            "enabled": true,
            "mode": "persistent",
            "databases": [
                "/Users/zachgonser/.openclaw/memory/main.sqlite",
                "/Users/zachgonser/clawd/memory/stanton-times.sqlite"
            ],
            "chunk_tokens": 400,
            "chunk_overlap": 80
        }
    },
    "docs": {
        "policy": {
            "goals_constraints": "/Users/zachgonser/clawd/GOALS_CONSTRAINTS.md",
            "guardrails": "/Users/zachgonser/clawd/GUARDRAILS.md",
            "proactive_mode": "/Users/zachgonser/clawd/PROACTIVE_MODE.md",
            "model_strategy": "/Users/zachgonser/clawd/MODEL_STRATEGY.md",
            "budget_policy": "/Users/zachgonser/clawd/BUDGET_POLICY.md",
            "ops_runbook": "/Users/zachgonser/clawd/OPS_RUNBOOK.md"
        },
        "doc_index": "/Users/zachgonser/clawd/projects/ventureos/docs/DOC_INDEX.md"
    },
    "meta": {
        "lastTouchedVersion": "2026.1.24-3",
        "memory_migration_date": "2026-02-01"
    },
    "auth": {
        "profiles": {
            "anthropic:default": {
                "mode": "token",
                "provider": "anthropic"
            }
        }
    }
}

<!-- antfarm:workflows -->
# Antfarm Workflow Policy

## Installing Workflows
Run: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow install <name>`
Agent cron jobs are created automatically during install.

## Running Workflows
- Start: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run <workflow-id> "<task>"`
- Status: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status "<task title>"`
- Workflows self-advance via agent cron jobs polling SQLite for pending steps.
<!-- /antfarm:workflows -->

