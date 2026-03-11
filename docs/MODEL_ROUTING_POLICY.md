# Model Routing Policy (Cheap vs Strong)

This policy defines **how OpenClaw selects models** based on task complexity, risk, cost, and operational constraints.

> **Related:** `docs/MODEL_STRATEGY.md`, `docs/MODEL_FALLBACK_CHAIN.md`, `docs/BUDGET_POLICY.md`, `docs/DEGRADATION_POLICY.md`, `docs/GUARDRAILS.md`.

---

## 1) Principles

1. **Default to cheap** for routine, low‑risk work.
2. **Escalate to strong** when reasoning depth, ambiguity, or risk increases.
3. **Never downgrade safety‑critical tasks** due to cost alone.
4. **Be explicit about routing** (log the reason and budget state).
5. **Fail soft**: if strong is unavailable, either fall back safely or ask for approval.

---

## 2) Model Tiers

| Tier | Purpose | Typical Use | Notes |
|---|---|---|---|
| **Cheap (default)** | Speed + cost efficiency | Summaries, formatting, extraction, simple Q&A, routine actions | Preferred for most tasks |
| **Strong** | Higher reasoning + planning | Multi‑step plans, code changes, ambiguous requirements, high‑risk actions | Use when quality/risk demands it |
| **Local (fallback)** | Continuity when remote unavailable | Read‑only checks, simple transformations | Use only if policy allows |

---

## 3) Routing Criteria

Evaluate the task on these dimensions:

| Dimension | Cheap when… | Strong when… |
|---|---|---|
| **Complexity** | Single‑step, deterministic | Multi‑step, branching, cross‑file reasoning |
| **Ambiguity** | Clear instructions, stable schema | Requirements unclear, need interpretation |
| **Risk** | Read‑only or low impact | External side‑effects, config changes, publishing |
| **Tool orchestration** | 0–1 tool call | Multiple tools, retries, fallback planning |
| **Context size** | Small context (single file/section) | Large context, multi‑doc synthesis |
| **Quality bar** | Draft/quick result acceptable | High‑fidelity output required |

If **any strong trigger** is present (Section 4), choose **Strong** unless budget gates prohibit it and the task is not safety‑critical.

---

## 4) Deterministic Decision Rules

### 4.1 Hard Triggers → **Strong**
Use **Strong** when **any** of the following are true:

- **Ambiguous requirements** or missing constraints
- **Multi‑step planning** or cross‑file changes
- **High‑risk actions** (publishing, payments, deletions, config changes, external comms)
- **Security / privacy / auth** implications
- **Tool orchestration** across multiple dependencies or fallbacks
- **Complex debugging** or incident response
- **User explicitly requests “strong”**

### 4.2 Safe Defaults → **Cheap**
Use **Cheap** when **all** of the following are true:

- Task is **low‑risk** and **read‑only**
- Requirements are **clear and bounded**
- Single‑step output (summary, extract, format, classify)
- Limited context (single file/section)
- User explicitly requests “cheap” **and** no strong trigger applies

### 4.3 Budget Gates (from `docs/BUDGET_POLICY.md`)

- **50% usage:** FYI only — no routing changes
- **80% usage:** Strong requires **explicit justification** in routing log
- **90% usage:** **Restrict to cheap** unless the task is **safety‑critical** or the user approves higher cost

If budget gating blocks Strong, **ask for approval** or **defer** the task if risk/quality would be compromised.

### 4.4 Degradation / Availability Gates

If Strong is unavailable:
- **Low‑risk tasks:** fall back to **Cheap** (note limitations)
- **High‑risk tasks:** **pause** and request approval or defer (see `docs/DEGRADATION_POLICY.md`)

---

## 5) Fallback Chain

**See:** `docs/MODEL_FALLBACK_CHAIN.md` for triggers, retry/timeout interaction, and escalation rules.

**Primary chain:** `Strong → Cheap → Local` (when strong is required)

**Cheap‑default chain:** `Cheap → Strong` if confidence is low or QA checks fail

### Escalation Conditions (Cheap → Strong)
- Output fails **quality checks** or is incomplete
- Task turns out to be **multi‑step** or ambiguous
- User requests higher fidelity

### De‑escalation Conditions (Strong → Cheap)
- Budget gate at **90%** and task is **low‑risk**
- Strong is unavailable and task is safe to downgrade

All fallbacks must be **logged with reason**.

---

## 6) Example Routing Rules

**Cheap**
- Summarize a doc section
- Reformat markdown
- Extract a list of headings
- Classify issues into tags
- Answer a simple, bounded question

**Strong**
- Modify code across multiple files
- Write or revise policy docs with ambiguity
- Any publish/post to external channels
- Plan a multi‑step rollout or incident response
- Resolve conflicting requirements

**Budget‑gated**
- At **90% usage**, keep summaries/formatting on Cheap
- At **90% usage**, require approval before Strong for anything beyond read‑only tasks

---

## 7) Required Logging Fields (Routing)

Log these fields on each decision:

- `model_selected` (cheap/strong/local)
- `routing_reason` (trigger list)
- `task_risk_level` (low/medium/high)
- `budget_state` (current usage tier)
- `fallback_used` (true/false)
- `fallback_reason` (if any)

---

## 8) Example Routing Log Snippets

**Example A — Summary (Cheap):**
```
model_selected=cheap
routing_reason=single-step,low-risk
budget_state=50%
```

**Example B — Multi-file change (Strong):**
```
model_selected=strong
routing_reason=multi-step,cross-file,high-risk
budget_state=80% (justified)
```

**Example C — Strong unavailable (defer):**
```
model_selected=cheap
routing_reason=strong-unavailable
fallback_used=true
fallback_reason=blocked-by-availability
```
