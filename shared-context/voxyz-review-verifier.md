# VOXYZ vs VentureOS — Verifier Review (Quality/Testing)
**Date:** 2026-02-14  
**Scope:** Quality signal, testability, and compliance validation (role cards + voice directives)

---

## 1) Voice Directive RULES (“1 specific fact + 1 action”, anti-filler)

### Does it improve output quality?
**Yes, for status/dispatch + operational comms.** Requiring *at least* one concrete fact and one next action strongly reduces low-information updates (“ack”, “aligned”, “sounds good”) and forces agents to either:
- surface evidence (“what did we observe?”), and
- commit to a next step (“what will happen next?”).

In production QA terms, it pushes every message toward **(observation → intent)**, which is a good default for debugging and incident-style workflows.

### Where it adds friction / risk
**Main risk: it can incentivize fake specificity.** When an agent has no new information, a hard rule can push it to manufacture a “fact” to satisfy format. This is the classic *metric-driven confabulation* failure mode.

Common edge cases:
- **No new evidence available:** agent is waiting on user input or long-running tool execution.
- **Message purpose is purely social/ack:** e.g., “received, will proceed” becomes forced.
- **Fact correctness is untested:** presence of a “fact” doesn’t mean it’s true.

### Quality outcome: net signal-to-noise
**Net positive if the “fact” must be evidence-linked.** The rule improves SNR when paired with a constraint like:
- **Fact must be *verifiable* (or explicitly marked as assumption)** and ideally include a pointer to source (log line, file path, tool output id, URL).

Without evidence-linking, the rule can create *high-confidence wrongness* (a worse failure mode than filler).

### Recommendation: adopt for sub-agent dispatch messages?
**Recommend adoption with guardrails and scoping.**

**Adopt (P0) for:**
- sub-agent progress updates
- verifier/QA escalations
- task handoffs / “what changed + what next” summaries

**Do NOT hard-enforce for:**
- pure acknowledgements in human chat
- creative brainstorming where exploration is valuable

**Implementation suggestion (reduces ambiguity & test burden):**
- Require a lightweight structured format:
  - `Fact:` … (include evidence pointer when possible)
  - `Action:` … (imperative, next step)
- Allow explicit uncertainty tags:
  - `Fact (assumption): …` or `Fact (unknown): waiting on …`

This keeps the VOXYZ spirit while reducing the incentive to invent details.

---

## 2) Quality Measurement: VOXYZ CRE vs VentureOS agent-specific CRE

### VOXYZ generic CRE: `draftCount × acceptRate`
**Pros:**
- Simple, universal, low instrumentation cost
- Good for measuring a narrow concept: “how often is work produced and accepted?”

**Cons / failure modes:**
- **Role mismatch:** verifier output is not “drafts”; quality work is often *negative work* (preventing bad merges, catching risks).
- **Perverse incentives:** encourages more drafts, even if redundant; acceptRate can be gamed by lowering ambition.
- **No precision/recall:** doesn’t distinguish false positives vs true catches (critical for QA/security roles).

### VentureOS agent-specific metrics (bugs_caught, reuse_30d, verifier_pass, etc.)
**Pros:**
- **Higher construct validity:** measures what “good” looks like per role
- Enables diagnosing failure modes (e.g., verifier: high FP rate vs low catch rate)
- Supports *operational reliability* (trend, regression detection, confidence)

**Cons:**
- Higher instrumentation + schema churn
- Harder to compare agents on a single axis without normalization

### Which produces better quality signals?
**Agent-specific metrics win for quality signal.** Generic throughput×acceptance is a weak proxy once roles diverge.

### Recommendation: hybrid metric model
**Use a 2-layer scoring system:**
1) **Global health (generic, low-stakes):** throughput-ish measures (completed work items, acceptRate) used for capacity planning only.
2) **Role score (primary):** agent-specific quality metrics with explicit definitions and calibration.

For **Verifier**, suggested core metrics:
- **Catch Precision:** validated_issues / total_issues_flagged
- **Catch Recall (approx):** validated_issues / (validated_issues + escaped_issues) where “escaped” is post-merge bug reports / incident tags
- **Severity-weighted impact:** Σ(severity_weight × validated_issue)
- **Time-to-detection:** when did we flag it relative to merge/release?

Add confidence intervals / rolling windows to avoid overreacting to small sample sizes.

---

## 3) Testing Strategy: validating role cards + voice directive compliance

### A) Role cards: how to validate compliance
**Make role cards machine-readable, then test them like contracts.**

**Schema-level tests (cheap, high value):**
- Role card completeness: required fields present (`inputs`, `outputs`, `definitionOfDone`, `hardBans`, `escalation`, `metrics`)
- Field type checks + non-empty lists
- “Hard bans” are machine-actionable (e.g., tagged categories like `security`, `publishing`, `numbers`, `medical`)

**Behavior-level tests (more expensive):**
- Golden prompt suites per agent:
  - Provide standardized tasks and assert expected behaviors:
    - bans respected (no direct posting, no made-up numbers)
    - escalation triggers fire when conditions met
    - DoD checklist is satisfied (or explicitly not satisfied)

**Suggested harness design:**
- Each test case stores:
  - `prompt`, `expected_escalate` (bool + reason tags), `expected_bans` (tag list), `expected_output_fields`
- Run in CI with deterministic settings where possible.

### B) Voice directive “1 fact + 1 action”: can we automate?
**Yes—if we define a detectable surface form.**

#### Option 1 (recommended): format contract (parser-based)
Require in dispatch contexts:
- line starting with `Fact:`
- line starting with `Action:`

**Automated test:** regex/parser checks presence + non-trivial length.

**Limitation:** still doesn’t guarantee the “fact” is *true*.

#### Option 2: LLM-as-judge (semantic)
Use an evaluator model to score:
- is there a specific fact?
- is there a concrete action?
- is the fact supported by referenced evidence?

**Pros:** closer to intent.
**Cons:** evaluator drift, cost, and needs calibration.

#### Option 3: structured JSON output (strongest, internal-only)
Agents produce:
```json
{ "fact": "…", "fact_evidence": "…", "action": "…" }
```
Then render to human-readable text.

**Pros:** easiest to validate programmatically.
**Cons:** changes “voice” unless rendering is clean.

### C) Fact correctness (the hard part)
The “fact present” rule is not enough; **truth requires grounding**.

Practical approaches:
- Require `fact_evidence` pointer (file path + line span, tool output id, URL).
- Where evidence exists, add **retrieval-based verification**:
  - e.g., if evidence is a file path, the test harness loads it and checks the claim with a rule-based matcher or judge model.
- Track a metric: **Unsupported Fact Rate** = facts without evidence pointers / total facts.

### QA burden estimate
- **Low** for schema validation + `Fact/Action` parser checks.
- **Medium** for golden prompt suites (needs maintenance as roles evolve).
- **High** for semantic truth-testing (requires evaluators + evidence plumbing + adjudication workflow).

Recommendation: start with low/medium, add high only where risk justifies it (security, publishing, numeric claims).

---

## Recommendations (Quality-Relevant) — P0 / P1 / P2

### P0 (must-have for quality)
1) **Role cards as machine-readable contracts**
   - include `hardBans`, `escalation`, `definitionOfDone`, `inputs/outputs`
   - add schema validation + CI checks

2) **Dispatch-format rule: “Fact + Action” with evidence pointer**
   - enforce only in operational contexts (sub-agent updates, escalations, handoffs)
   - adopt a surface form (`Fact:` / `Action:`) to make testing trivial

3) **Agent-specific quality metrics (keep VentureOS approach)**
   - keep global metrics, but do not rely on generic CRE for QA roles
   - for verifier: precision/recall proxies + severity weighting + time-to-detection

### P1 (high value, moderate effort)
1) **Golden prompt compliance suites per agent**
   - test hard bans + escalation triggers + DoD

2) **Unsupported Fact Rate metric + nudges**
   - if a message has `Fact:` without evidence, penalize / request citation

3) **Evaluator (LLM-as-judge) for a small set of high-risk tasks**
   - numeric claims, security-sensitive actions, publishing

### P2 (conditional / later)
1) **Full semantic truth-testing at scale**
   - expensive and will need human adjudication loops

2) **Conversation-dynamics enforcement (affinity-driven talk rules)**
   - not directly quality-positive until multi-agent roundtables exist

---

## Bottom line (Verifier stance)
- VOXYZ’s “1 fact + 1 action” **improves signal-to-noise** *only when paired with evidence-linking and scoped enforcement*.
- VentureOS’s **agent-specific metrics** are the stronger quality signal; keep them and treat generic CRE as secondary.
- Testing is feasible if we convert “voice directives” into **detectable contracts** (format + schema + golden suites) and reserve semantic truth checks for high-risk surfaces.
