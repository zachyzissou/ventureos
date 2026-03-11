# Feedback Capture Loop

## Purpose
Provide a **durable, auditable feedback loop** for mission outputs so approvals, rejections, and revision requests are captured, logged, and routed into iteration work.

This loop is **separate from QA checks** (format/completeness) but **tightly integrated** with QA and mission close‑out.

---

## Goals
- **Frictionless capture** (👍/👎 + optional revision request)
- **Structured data** for routing + analytics
- **Guaranteed logging** for audit + retention
- **Clear iteration path** (negative feedback → revision work)
- **Explicit acceptance** when output is approved

---

## Feedback Signals

| Signal | Capture Method | Meaning | Default Next Action |
| --- | --- | --- | --- |
| **👍 Thumbs Up** | Reaction or message (“approved”, “looks good”) | Output accepted | Log as `accepted`; close mission if no other gates |
| **👎 Thumbs Down** | Reaction or message (“not ok”) | Output rejected | Ask for specifics; open revision ticket if details provided |
| **Revision Request** | Message starting with `revise:` / `change:` / “revision request” | Specific change request | Log request; create iteration task; keep mission open |

**If only a 👎 is received:** request a short revision note. If none provided within 24h, log `rejected_no_details` and escalate to owner.

---

## Capture Mechanism (Operational)
1. **Deliver output** with explicit prompt:
   - “Please respond with 👍/👎, or send `revise:` with requested changes.”
2. **Parse feedback** into structured fields (reaction + optional text).
3. **Log event** (JSONL) and attach mission metadata.
4. **Route action** based on signal:
   - 👍 → mark accepted
   - 👎 / revision request → create follow‑up task (queue + GitLab issue link)

---

## Data Model

### `feedback_event` (JSONL record)
```json
{
  "id": "b1b7f0e0-1d3a-4e6a-9d79-9a5a9b13b5aa",
  "timestamp": "2026-02-08T06:15:12Z",
  "feedbackType": "thumbs_up",
  "rating": 1,
  "comment": "Looks good.",

  "source": {
    "channel": "discord",
    "messageId": "1188822000",
    "userId": "user-42",
    "userLabel": "Zach"
  },

  "mission": {
    "missionId": "mission-2026-02-08-003",
    "jobId": "issue-10",
    "businessUnit": "ventureos",
    "missionType": "ops",
    "role": "Verifier"
  },

  "output": {
    "outputType": "Spec",
    "artifactPaths": [
      "docs/FEEDBACK_LOOP.md"
    ],
    "outputId": "output-01"
  },

  "qa": {
    "status": "QA_PASS",
    "checkedBy": "Verifier",
    "checkedAt": "2026-02-08T06:10:00Z"
  },

  "disposition": {
    "status": "accepted",
    "followupTaskId": "",
    "issueUrl": ""
  }
}
```

### Revision Request Payload (optional)
```json
"revision": {
  "requestText": "Revise the data model to include severity and deadline.",
  "severity": "major",
  "priority": "P1",
  "deadline": "2026-02-10",
  "expectedArtifacts": ["docs/FEEDBACK_LOOP.md"],
  "requestedBy": "Zach"
}
```

**Field Notes**
- `feedbackType`: `thumbs_up | thumbs_down | revision_request`
- `rating`: `1` (up), `-1` (down), `0` (request)
- `disposition.status`: `new | triaged | queued | accepted | rejected | resolved`

---

## Logging + Storage
- **Primary log:** `~/clawd/runtime/logs/feedback/YYYY-MM-DD.jsonl`
- **Format:** append‑only JSONL, one `feedback_event` per line
- **Retention:** follow `CONTEXT_REFRESH.md` retention rules
- **Linkage:** include `missionId`, `jobId`, `outputId`, and artifact paths

---

## QA + Iteration Integration
- **QA checks** validate formatting/completeness (**QUALITY_CHECKS.md**).
- **Feedback capture** is a **post‑QA gate**:
  - `QA_PASS/WARN` → request feedback
  - `thumbs_up` → mark accepted; close mission
  - `thumbs_down` / `revision_request` → open iteration ticket and keep mission open
- Negative feedback does **not** overwrite QA status; it is recorded as `feedback_status` and routed to iteration.

---

## Iteration Flow (State Machine)
1. **Delivered** → `feedback_status: pending`
2. **Accepted** → `feedback_status: accepted` → close
3. **Rejected / Revision** → `feedback_status: needs_revision`
   - Create queue entry (see **PROACTIVE_ENGINE.md**)
   - Open GitLab issue (or update existing issue)
4. **Resolved** → deliver revised output → capture feedback again

---

## Routing Defaults
- `thumbs_down` → **P1** revision task (unless severity marked `minor`)
- `revision_request` → **P2** by default; **P1** if `severity=major`
- `thumbs_up` → log only

---

## Metrics (for METRICS_PLAN)
- **Acceptance rate** = thumbs_up / total feedback events
- **Revision rate** = (thumbs_down + revision_request) / total
- **Mean time to feedback** (delivery → feedback)
- **Mean time to resolution** (feedback → accepted)

---

## Ownership
- **Verifier**: ensures feedback is requested + logged
- **Sentinel**: triages negative feedback; opens revision tasks
- **Archivist**: ensures feedback logs are retained + indexed
