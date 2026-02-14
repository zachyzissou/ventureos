# VentureOS Capabilities — What's Available

> **Purpose:** Living index of VentureOS patterns, scripts, and policies. When you need to do complex work, check here first.

**Location:** `~/clawd/ventureos/` (canonical install, read-only for most agents)

**Last Updated:** 2026-02-13

---

## Core Concept

VentureOS is **not an app you run**. It's a handbook + toolbox for how agents operate:
- **Patterns** (fresh context, verification loops, retry logic)
- **Policies** (model routing, budget constraints, degradation rules)
- **Conventions** (how to name things, where to log, what to check)
- **Reference scripts** (available when needed, not "installed")

**Your workspace files (AGENTS.md, SOUL.md, etc.) define WHO YOU ARE.**
**VentureOS defines HOW YOU WORK.**

---

## Workflow Patterns

### 1. Spawn with Retry (`scripts/spawn-with-retry.mjs`)
**What:** Wraps `sessions_spawn` with exponential backoff for transient failures
**When:** Single-step tasks that need reliability
**Usage:**
```bash
node ~/clawd/ventureos/scripts/spawn-with-retry.mjs \
  --target agent:synth \
  --prompt "Fix bug #42" \
  --max-retries 3 \
  --backoff-ms 2000
```

### 2. Spawn with Verification (`scripts/spawn-with-verification.mjs`)
**What:** Multi-step workflow with fresh context per step + dev↔verify loop
**When:** Complex tasks requiring quality gates
**Patterns included:**
- Fresh context per step (new markdown files, no state pollution)
- Verifier gating (dev can't mark own homework)
- Retry logic (exponential backoff for spawn failures)

**Usage:**
```bash
node ~/clawd/ventureos/scripts/spawn-with-verification.mjs \
  --task "Implement feature X with tests" \
  --dev-target agent:synth \
  --verify-target agent:verifier \
  --max-verify-cycles 2 \
  --max-spawn-retries 3
```

**Docs:** `~/clawd/ventureos/docs/SESSIONS_SPAWN_ANTFARM_PATTERNS.md`

---

## Infrastructure Scripts

### Backup & Recovery
- `scripts/backup-clawd.sh` — Backup OpenClaw state + workspaces
- `scripts/restore-backup.sh` — Restore from backup
- `scripts/verify-backup.sh` — Validate backup integrity

### Monitoring & Maintenance
- `scripts/monitor-openclaw.sh` — Health checks for gateway/agents
- `scripts/routing-healthcheck.sh` — Verify message routing works
- `scripts/budget-check.sh` — Check spending vs budget
- `scripts/export-cron-logs.sh` — Export cron job history

### Operational Helpers
- `scripts/archive-task-runs.sh` — Archive old task execution logs
- `scripts/guarded-run.sh` — Run command with resource guards
- `scripts/with-timeout.sh` — Timeout wrapper for long-running tasks
- `scripts/retry.sh` — Simple retry loop for shell commands

---

## Key Policies (docs/)

### Model Management
- **MODEL_ROUTING_POLICY.md** — When to use which model (Opus for external content, Sonnet default, etc.)
- **MODEL_FALLBACK_CHAIN.md** — Degradation strategy when primary model unavailable
- **BUDGET_POLICY.md** — Spending limits per agent/task type

### Operational Guardrails
- **DEGRADATION_POLICY.md** — How to degrade gracefully under load/cost pressure
- **GUARDRAILS.md** — Safety constraints (exec allowlists, credential isolation, etc.)
- **ERROR_TAXONOMY.md** — How to classify and handle errors

### Team Coordination
- **MULTI_AGENT_TEAM.md** — Agent roles, responsibilities, communication patterns
- **MISSION_CONTROL.md** — Mission Control (Nexus) orchestration patterns
- **OPS_RUNBOOK.md** — Common operational procedures

### Development Standards
- **ARCHITECTURE.md** — System design principles
- **CRON_SPECS.md** — How to write cron jobs
- **CONTEXT_REFRESH.md** — When/how to compact context

---

## How to Use This

### When You Need to Do Something Complex
1. **Check this doc** for relevant patterns/scripts
2. **Read the script/doc** to understand usage
3. **Reference by absolute path** (e.g., `node ~/clawd/ventureos/scripts/spawn-with-verification.mjs`)
4. **Don't copy scripts** — reference the central install

### When VentureOS Adds New Capabilities
- Nexus or Oracle will update this doc
- New patterns announced in #nexus-mission-control
- No action needed — just reference this doc when you need them

### When You Have Questions
- Read `~/clawd/ventureos/docs/DOC_INDEX.md` for full doc inventory
- Check `~/clawd/ventureos/README.md` for overview
- Ask in shared-context (observations or coordination)

---

## Version Info
- **Current Commit:** f9a57d9 (Antfarm patterns merge)
- **Update Frequency:** After major merges (MRs that add patterns/scripts)
- **Owner:** Synth develops, Nexus maintains this doc

---

## Quick Reference Table

| Need | Use | Location |
|------|-----|----------|
| Reliable single spawn | spawn-with-retry.mjs | scripts/ |
| Multi-step workflow with QA | spawn-with-verification.mjs | scripts/ |
| Backup OpenClaw | backup-clawd.sh | scripts/ |
| Check health | monitor-openclaw.sh | scripts/ |
| Verify routing | routing-healthcheck.sh | scripts/ |
| Model routing rules | MODEL_ROUTING_POLICY.md | docs/ |
| Budget limits | BUDGET_POLICY.md | docs/ |
| Team roles | MULTI_AGENT_TEAM.md | docs/ |
| Cron best practices | CRON_SPECS.md | docs/ |
| Error handling | ERROR_TAXONOMY.md | docs/ |

---

## Critical Rules

1. **Read-only**: Most agents should NOT modify ventureos repo
2. **Synth owns development**: If you need a new pattern, spawn Synth
3. **Reference, don't copy**: Use absolute paths to scripts
4. **Update this doc**: When new capabilities ship, update this index (Nexus/Oracle)
5. **Check before building**: Don't reinvent patterns that already exist here
