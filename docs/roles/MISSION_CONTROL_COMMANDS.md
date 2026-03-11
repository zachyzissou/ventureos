# Mission Control Commands (v1)

These commands are valid in **DMs** and **#echo-mission-control**.

## Rules
- **GitLab is canonical**. If work is non-trivial, it gets a GitLab issue.
- **No default project**. If you don’t specify a project and context isn’t obvious, Mission Control asks **one question**: “Which GitLab project?”
- Role channels are **webhook-only**; Mission Control posts user-visible output via webhook and returns `NO_REPLY`.

## Project selection
Mission Control will accept any of:
- a GitLab link (issue/MR/project)
- `group/project` (e.g. `zachgonser/ventureos`)
- a repo nickname you use in conversation (Mission Control will search GitLab if ambiguous)

## Commands

### 1) create issue
**Use:** spin up canonical tracking.

**Syntax**
- `create issue in <project>: <title>`
- optional: add a second line with context.

**Output**
- Issue link
- Draft: Goal + Acceptance Criteria + Evidence plan
- Default label: `needs-evidence`

**Example**
create issue in zachgonser/ventureos: routing healthcheck

---

### 2) brief
**Use:** turn a messy request into a mission brief.

**Syntax**
- `brief <project>: <request>`

**Output**
- Goal
- Acceptance Criteria
- Risks / guardrails
- Evidence plan
- Suggested squad (Oracle/Atlas/Sentinel/Verifier/Archivist/Synth)

---

### 3) dispatch
**Use:** assign roles against a specific issue.

**Syntax**
- `dispatch <issue link>: <who does what>`

**Output**
- Tasking list by role
- Expected deliverables
- When to expect synthesis

**Example**
dispatch http://slurpnet:9080/zachgonser/ventureos/-/issues/46: Oracle=design, Atlas=implementation, Sentinel=guardrails, Verifier=test plan

---

### 4) synth
**Use:** produce one clean update (and post it to GitLab).

**Syntax**
- `synth <issue link>`

**Output**
- Decisions
- Next 3 actions
- Blockers
- Evidence links (if any)

---

### 5) status
**Use:** quick operational snapshot.

**Syntax**
- `status <issue link>` or `status <project>`

**Output**
- Current objective
- Active threads
- Next 3 actions

---

### Special: routing healthcheck ping
In `#echo-mission-control` only:
- `hc ping <nonce>` → `hc pong <nonce> (Mission Control) <UTC timestamp>`
