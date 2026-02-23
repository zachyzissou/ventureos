# Style Templates (Summaries, Reports, Incident Notes, Decision Memos)

## Purpose
Provide **consistent, audit‑friendly** formats for common outputs. These templates align with `docs/QUALITY_CHECKS.md` and define **required sections** plus tone/format guidance.

## How to Use
- **Pick the template** that matches the output type.
- **Keep required sections** in place and non‑empty.
- If a section is not applicable, write **“None”** (do not delete the section).
- Use **repo‑relative paths** for artifacts (or full URLs).
- If information is unknown, **state it explicitly** and log it under Risks/Limitations.

---

## Tone + Format Guidelines

### Tone (all outputs)
- **Clear, concise, neutral.** No hype or ambiguity.
- **Evidence‑based.** Separate facts from assumptions.
- **Actionable.** Call out blockers, risks, and asks.
- **No blame.** Focus on systems and outcomes.

### Format (all outputs)
- Use **headings** and **bulleted lists** (avoid dense paragraphs).
- Include **dates/times** in `YYYY‑MM‑DD` (or `YYYY‑MM‑DD HH:MM TZ`).
- Keep summaries **1–3 bullets**.
- Use explicit labels (e.g., “Output Type: …”).

---

## 1) Summary Update

**Required sections**
- Output Type
- Date/Time Window
- Summary (1–3 bullets)
- Progress / Completed
- Risks / Limitations
- Next Steps / Asks
- Artifacts / Links

**Template**
```
**Output Type:** Summary Update
**Date/Time Window:** <YYYY‑MM‑DD … YYYY‑MM‑DD>

**Summary**
- <1–3 bullets>

**Progress / Completed**
- …

**Risks / Limitations**
- … (or “None”)

**Next Steps / Asks**
- … (or “None”)

**Artifacts / Links**
- <path or URL> — <description> (owner/next step)
```

---

## 2) Report / Analysis

**Required sections**
- Output Type
- Question / Goal
- Executive Summary (1–3 bullets)
- Scope (In/Out)
- Method / Sources
- Findings (with evidence)
- Limitations
- Recommendation
- Artifacts / Links

**Template**
```
**Output Type:** Report / Analysis
**Question / Goal:** <what is being answered>

**Executive Summary**
- <1–3 bullets>

**Scope**
- In: …
- Out: …

**Method / Sources**
- <data sources, tools, time window>

**Findings (Evidence‑backed)**
- Finding 1 — <evidence/link>
- Finding 2 — <evidence/link>

**Limitations**
- … (or “None”)

**Recommendation**
- …

**Artifacts / Links**
- <path or URL> — <description>
```

---

## 3) Incident Note

**Required sections**
- Output Type
- Incident ID / Title
- Severity (P0/P1/P2)
- Date/Time (first detected, resolved if applicable)
- Summary
- Impact
- Detection / Trigger
- Timeline (key events with timestamps)
- Root Cause (or “Unknown” + investigation status)
- Mitigation / Resolution
- Follow‑ups / Preventative Actions
- Communications (who was notified)
- Artifacts / Links

**Template**
```
**Output Type:** Incident Note
**Incident ID / Title:** <id + short title>
**Severity:** P0 | P1 | P2
**Detected:** <YYYY‑MM‑DD HH:MM TZ>
**Resolved:** <YYYY‑MM‑DD HH:MM TZ> (or “Ongoing”)

**Summary**
- <1–3 bullets>

**Impact**
- …

**Detection / Trigger**
- …

**Timeline**
- <time> — <event>
- <time> — <event>

**Root Cause**
- <known cause> (or “Unknown — investigation in progress”)

**Mitigation / Resolution**
- …

**Follow‑ups / Preventative Actions**
- … (owner + due date if known)

**Communications**
- <who was notified, when>

**Artifacts / Links**
- <logs, tickets, dashboards, files>
```

---

## 4) Decision Memo

**Required sections**
- Output Type
- Decision
- Context
- Options Considered
- Criteria / Rationale
- Tradeoffs / Impact
- Risks
- Approval Required (Yes/No + who)
- Next Steps
- Artifacts / Links

**Template**
```
**Output Type:** Decision Memo
**Decision:** <clear, single‑sentence decision>

**Context**
- …

**Options Considered**
- Option A — …
- Option B — …

**Criteria / Rationale**
- …

**Tradeoffs / Impact**
- …

**Risks**
- … (or “None”)

**Approval Required:** Yes | No
- If Yes: <approver name/role>

**Next Steps**
- …

**Artifacts / Links**
- <path or URL> — <description>
```

---

## Notes
- These templates are **minimum required sections**. Add more sections only when they add clarity.
- If a template doesn’t fit, document the deviation in **Risks/Limitations** and cite why.
