# Output QA Checks (Format + Completeness)

## Purpose
Ensure every mission output is **formatted consistently** and **complete enough** to be audited, reused, and archived. These checks focus on **format + completeness** (not deep correctness). Correctness is handled by Verifier test plans and gate reviews.

## Scope
Applies to:
- Mission outputs (briefs, plans, reports, specs, decision memos)
- Execution logs and run summaries
- Artifact handoffs and verification notes
- User‑facing updates (status, risk, next steps)

## Template Alignment
For standard formats, use `docs/STYLE_TEMPLATES.md`. If you deviate from a template, note why in **Risks/Limitations**.

## Definitions
- **Output type:** The category of deliverable (status update, plan, report, etc.).
- **Required fields:** Sections that must be present and non‑empty for a given output type.
- **QA status:** `QA_PASS`, `QA_WARN`, or `QA_FAIL` based on completeness.

---

## QA Workflow (Format + Completeness)
1. **Identify output type(s).** If mixed, evaluate each type separately.
2. **Run Universal Checks** (format + baseline fields).
3. **Run Type‑Specific Checks** using the required‑fields table.
4. **Validate artifacts/links** (paths exist; URLs valid format).
5. **Assign QA status** and record in verification notes.
6. **Record feedback status** once output is delivered (pending/accepted/needs‑revision).
   - See **FEEDBACK_LOOP.md** for capture + logging rules.

---

## Universal Format + Completeness Checks
These apply to all formal outputs (except short “FYI” messages).

**Format checks**
- [ ] Output declares its **type** (e.g., “Output Type: Plan” or section header)
- [ ] Uses clear **headings** or key:value structure
- [ ] Lists are bullet/checkbox formatted (no dense walls of text)
- [ ] Dates use `YYYY‑MM‑DD` (or `YYYY‑MM‑DD HH:MM TZ` when time matters)

**Completeness checks**
- [ ] **Summary** present (1–3 bullets)
- [ ] **Artifacts/Links** listed (or explicit “None created”)
- [ ] **Risks/Limitations** listed (or explicit “None”) 
- [ ] **Next Steps / Asks** listed (or explicit “None”)
- [ ] No unresolved placeholders (`TBD`, `TODO`, `??`) unless explicitly called out as a risk

**Artifact validation**
- [ ] File paths exist (or are clearly marked “planned / not created”) 
- [ ] Each artifact has a short description and owner/next step

**Feedback capture (post‑delivery)**
- [ ] Feedback status recorded (pending/accepted/needs‑revision)
- [ ] Feedback event logged if received (thumbs up/down or revision request)
- [ ] Negative feedback routed to iteration (see **FEEDBACK_LOOP.md**)

---

## Output Types + Required Fields

| Output Type | Required Fields (in addition to Universal Checks) |
| --- | --- |
| **Status Update** | Progress/Completed, Blockers/Dependencies, Timeline or ETA (if known) |
| **Plan / Checklist** | Objective, Scope (In/Out), Deliverables, Steps or Milestones, Definition of Done, Dependencies/Risks |
| **Decision Memo** | Decision, Options Considered, Criteria/Rationale, Tradeoffs/Impact, Approval Required (Yes/No + who) |
| **Report / Analysis** | Question/Goal, Method/Sources, Findings, Evidence links, Limitations, Recommendation |
| **Spec / Implementation** | Problem/Context, Requirements (functional/non‑functional), Proposed Approach, Interfaces/Schemas, Risks/Edge Cases, Validation/Testing, Open Questions |
| **Execution / Run Log** | Objective, Commands/Actions (copyable), Results/Outputs, Artifacts Created/Modified, Errors/Warnings, Environment/Context |
| **Artifact Manifest / Handoff** | Artifact list (path + description), Provenance/Inputs, Validation status, Usage/Next owner |
| **QA Results / Gate** | Scope, Checks run, Pass/Fail results, Issues/Defects, Go/Hold decision, Follow‑ups |

---

## Validation Rules
- **Required fields must be non‑empty.** Use “None” only when explicitly allowed.
- **Artifacts must be verifiable.** If a file is listed as created, it must exist at the stated path.
- **Links must be actionable.** Use repo‑relative paths or full URLs.
- **Commands must be copyable.** Run logs should include commands in code blocks and note working directory if not repo root.
- **Decisions must be explicit.** Decision memos and QA gates must include a clear “Decision” or “Go/Hold.”
- **If output is draft**, it must be labeled “Draft” and list missing sections in Risks/Limitations.

---

## Failure Handling

**QA Statuses**
- **QA_PASS:** All required fields present and valid.
- **QA_WARN:** Minor formatting issues or optional info missing; proceed but note limitations.
- **QA_FAIL:** Missing required fields, unresolved placeholders, or missing artifacts.

**Actions**
- **QA_PASS →** Proceed to gate/archive.
- **QA_WARN →** Proceed with limitations noted in verification log.
- **QA_FAIL →** **Hold** output; return to producer for rework. Escalate to Echo if time‑boxed.

**QA_FAIL Response Template**
```
QA_FAIL — Missing required fields
- [ ] <field 1>
- [ ] <field 2>
Fix: provide missing sections or mark as “None” where allowed.
```

---

## Checklist Templates

### Universal Output QA Checklist (Template)
- [ ] Output type labeled
- [ ] Summary present
- [ ] Artifacts/Links present (or “None created”)
- [ ] Risks/Limitations present (or “None”)
- [ ] Next Steps / Asks present (or “None”)
- [ ] No unresolved placeholders
- [ ] Links/paths validated
- [ ] Feedback status recorded (pending/accepted/needs‑revision)
- [ ] QA status recorded (PASS/WARN/FAIL)

### Plan / Checklist QA Template
- [ ] Objective stated
- [ ] Scope (In/Out) defined
- [ ] Deliverables listed
- [ ] Steps or milestones listed
- [ ] Definition of Done stated
- [ ] Dependencies/Risks listed

### Decision Memo QA Template
- [ ] Decision stated explicitly
- [ ] Options considered listed
- [ ] Rationale/criteria stated
- [ ] Tradeoffs/impact noted
- [ ] Approval required? (Yes/No + who)

### Run Log QA Template
- [ ] Objective stated
- [ ] Commands/actions listed (copyable)
- [ ] Results/outputs summarized
- [ ] Artifacts created/modified listed
- [ ] Errors/warnings captured
- [ ] Environment/context noted

### QA Results / Gate Template
- [ ] Scope covered
- [ ] Checks run listed
- [ ] Pass/Fail results included
- [ ] Issues/defects logged
- [ ] Go/Hold decision stated

---

## Examples

### Example — Status Update (QA_PASS)
**Output Type:** Status Update

**Summary**
- Implemented output QA checks doc and linked it in index.

**Progress / Completed**
- Added `docs/QUALITY_CHECKS.md`
- Updated `docs/DOC_INDEX.md`

**Artifacts/Links**
- `docs/QUALITY_CHECKS.md` — QA framework doc
- `docs/DOC_INDEX.md` — index update

**Risks/Limitations**
- None

**Next Steps / Asks**
- None

**QA Status:** QA_PASS

### Example — QA_FAIL (Missing Artifacts)
**Output Type:** Run Log

**Issue:** Output listed “created report” but no path provided.

**QA_FAIL — Missing required fields**
- [ ] Artifacts Created/Modified
Fix: add exact file paths and descriptions for created files.
