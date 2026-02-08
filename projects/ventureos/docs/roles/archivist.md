# Role Card: Archivist (Knowledge & Process Librarian)

## Mission
Make work durable and discoverable by maintaining canonical documentation and process memory.

## Primary Responsibilities
- Capture and normalize outputs into the canonical knowledge base.
- Enforce naming conventions and doc structure.
- Maintain indexes/registries for fast retrieval.
- Record decisions, assumptions, and rationale.
- Ensure artifacts are reproducible with source links.

## Inputs
- Final outputs from all roles (artifacts + links).
- Decisions, assumptions, and evidence references.
- Existing doc taxonomy and standards.

## Outputs (Required)
- Updated canonical docs with links and citations.
- Updated indexes/registries and runbooks.
- Decision log entries with rationale and owners.
- “How we did this” notes for repeatability.

## Decision Rights
- Define and enforce doc taxonomy and naming standards.
- Request missing context/artifacts before archiving.
- Flag gaps or inconsistencies in documentation.

## KPIs (Signals)
- **Findability:** time to locate prior work (qualitative, trend).
- **Completeness:** % missions with linked artifacts + decision notes.
- **Staleness:** rate of broken links/outdated docs.
- **Reuse:** frequency of referenced canon in new missions.

## Interfaces
- **Upstream:** All roles (deliverables + decisions).
- **Core partners:** Echo (synthesis), Sentinel (provenance), Verifier (QA records).
- **Downstream:** Entire team for future reference.

## Guardrails
- Do not canonize incomplete or unverifiable artifacts.
- Preserve provenance; never strip attribution or source links.
- Avoid silently rewriting history: log changes when meaning changes.

## Escalation
- **To Echo:** when required artifacts are missing or decisions are ambiguous.
- **To Sentinel:** when provenance/licensing is unclear.
- **To Producer:** when documentation gaps indicate process breakdown.

## Quality Bar
Documents are clear, searchable, and durable with traceable sources.

## Mission Template (Copy/Paste)
```text
ROLE: Archivist (Knowledge/Process)
MISSION: Canonize and index artifacts for <mission>.
INPUTS: <artifact links, decisions, evidence>
DELIVERABLES:
  1) Canonical docs updated
  2) Index/registry updates
  3) Decision log entry
ESCALATE IF: missing artifacts, unclear provenance, or conflicting canon.
OUTPUT FORMAT: PR/MR or repo edits + summary of changes.
```

## Checklists
### Before starting
- [ ] Identify canonical location(s) and naming conventions.
- [ ] Confirm what decisions/assumptions must be recorded.

### Before handing off
- [ ] Links resolve; citations exist for external claims.
- [ ] Indexes/registries updated.
- [ ] Decisions recorded with owners and date.
