# VentureOS Operating Contract (GitHub-First)

> Legacy filename retained for compatibility with existing links.

**Status:** Active

## 0) Principle
**GitHub is the system of record.** If it is not in GitHub (issue/PR/comments), it does not exist.
- Obsidian = supporting notes only.
- Chat/Discord = coordination only.

## 1) The Unit of Work
Every non-trivial piece of work MUST have a **GitHub Issue**.

**Issue contains:**
- **Goal** (what outcome exists when done)
- **Acceptance Criteria** (observable checks)
- **Owner / Squad** (who is accountable)
- **Evidence plan** (what to link when closing)

## 2) Definition of Done (DoD)
An issue is only "Done" when it has:
1) **Evidence** (links, screenshots, logs, or artifacts)
2) **Change record**
   - a **PR link**, or
   - a **commit link**, or
   - explicit note: "no code change" + why
3) **Verification**
   - who verified + what they checked
4) **Close-out note**
   - summary + follow-up issues if needed

### 2.1 Evidence types
- PR link (preferred)
- commit hash link
- CI/job run logs
- before/after screenshots
- config diffs
- reproducible commands

## 3) Execution Loop
**State machine:**
- Backlog -> Ready -> In Progress -> In Review -> Verified -> Done

**Rules:**
- **One accountable owner** per issue.
- Keep issue description stable; post progress as issue comments.
- For risky/ambiguous work, post a short plan comment before execution.

## 4) Agent Responsibilities
When an agent is asked to do non-trivial work:
1) Ask: **"What is the GitHub issue link?"**
2) If none exists: create one (or request creation if permissions require).
3) Work against acceptance criteria.
4) Post evidence + close-out note.

## 5) Reviews & QA
### 5.1 When a PR is required
Default: **If it changes code/config/docs, open a PR.**
Exceptions allowed only with explicit note.

### 5.2 Verifier responsibilities
- Confirm acceptance criteria.
- Confirm evidence links resolve.
- Confirm no secrets or obvious security footguns.

## 6) Communication Discipline
- Chat is for coordination, not canonical decisions.
- Decisions that affect scope/architecture must be copied into the GitHub issue.

## 7) Templates
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
If a task cannot be represented as an issue/PR (for example, urgent outage):
- Create a "Hotfix / Incident" issue as soon as possible and backfill evidence.

## Decisions (locked)
- **Enforcement via labels:** YES (see `docs/process/LABEL_PROTOCOL.md`).
- **PR required for code/config changes:** YES by default.
- **Mission Control issue creation:** allowed to auto-create issues with sane defaults.
