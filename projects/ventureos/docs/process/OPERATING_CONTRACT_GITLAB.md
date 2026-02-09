# VentureOS Operating Contract (GitLab-First)

**Status:** Draft

## 0) Principle
**GitLab is the system of record.** If it isn’t in GitLab (issue/MR/notes), it doesn’t exist.
- Obsidian = supporting notes only.
- Discord = coordination + status pings only.

## 1) The Unit of Work
Every non-trivial piece of work MUST have a **GitLab Issue**.

**Issue contains:**
- **Goal** (what outcome exists when we’re done)
- **Acceptance Criteria** (observable checks)
- **Owner / Squad** (who is accountable)
- **Evidence plan** (what we will link or attach)

## 2) Definition of Done (DoD)
An issue is only “Done” when it has:
1) **Evidence** (links, screenshots, logs, or artifacts)
2) **Change record**
   - either an **MR**, or
   - a **commit link**, or
   - an explicit note: “no code change” + why
3) **Verification**
   - who verified + what they checked
4) **Close-out note**
   - short summary + any follow-ups spawned as new issues

### 2.1 Evidence types (pick what fits)
- MR link (preferred)
- commit hash link
- job run logs (OpenClaw cron runs, CI logs)
- before/after screenshots
- config diffs
- reproducible commands (copy/paste)

## 3) Execution Loop (How work moves)
**State machine:**
- Backlog → Ready → In Progress → In Review → Verified → Done

**Rules:**
- **One accountable owner** per issue.
- Keep issue description stable; post progress as **issue notes**.
- For risky/ambiguous work, post a short **Plan** comment before execution.

## 4) Agent Responsibilities (Minimum)
When an agent is asked to do something non-trivial, it must:
1) Ask: **“What’s the GitLab issue link?”**
2) If none exists: create one (or request user to create if permissions/process require).
3) Work against acceptance criteria.
4) Post evidence + close-out note.

## 5) Reviews & QA
### 5.1 When an MR is required
Default: **If it changes code/config, open an MR.**
Exceptions allowed only with explicit note.

### 5.2 Verifier (QA) responsibilities
- Confirm acceptance criteria
- Confirm evidence links resolve
- Confirm no missing secrets / obvious security footguns

## 6) Communication Discipline
- Discord is for coordination and quick status, not canonical decisions.
- Any decision that affects scope/architecture must be copied into the GitLab issue as a note.

## 7) Templates (Copy/Paste)
### 7.1 Issue template (minimum)
**Goal:**

**Acceptance Criteria:**
- [ ]
- [ ]

**Owner/Squad:**

**Evidence plan:**
- 

**Risks/Notes:**

### 7.2 Close-out comment template
**Result:**

**Evidence:**
- 

**Verification:**
- 

**Follow-ups (new issues):**
- 

## 8) Escalation / Exceptions
If a task cannot be represented as an issue/MR (e.g., urgent outage):
- Create a “Hotfix / Incident” issue ASAP and backfill evidence.

---

## Decisions (locked)
- **Enforcement via labels:** YES (see below).
- **MR required for code/config changes:** YES by default.
- **Mission Control issue creation:** allowed to **auto-create** issues (with sane defaults).

## Labels (standard set)
Use these to keep flow honest and searchable:
- `needs-evidence`
- `needs-review`
- `needs-verification`
- `blocked`
- `no-code-change` (explicit exception flag)

## Open Questions (later)
1) One shared issue template across all projects, or per-project variants?
