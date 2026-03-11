# Proposal → Mission → Step Lifecycle

Issue: #227

## Delivered

- structured proposal intake with explicit metadata:
  - goal
  - estimated cost
  - required skills
  - risk assessment
  - ordered step plan with agent ownership
- mandatory human review workflow before mission execution:
  - `approve`
  - `reject`
  - `modify`
- mission execution engine:
  - dependency-aware step scheduler
  - automatic cross-agent handoff events
  - persisted mission/step status
- event stream:
  - persisted event log (`proposal.submitted`, `proposal.reviewed`, `mission.started`, `step.*`, `mission.completed|failed`)
  - WebSocket stream endpoint for live dashboard updates
- dashboard mission page enhancements:
  - proposal queue panel
  - active proposal mission progress panel

## API Surface

- `POST /api/proposal-lifecycle/proposals`
- `GET /api/proposal-lifecycle/proposals`
- `POST /api/proposal-lifecycle/proposals/:proposalId/review`
- `GET /api/proposal-lifecycle/missions`
- `GET /api/proposal-lifecycle/missions/:missionId`
- `POST /api/proposal-lifecycle/missions/:missionId/start`
- `GET /api/proposal-lifecycle/events`
- `GET /api/proposal-lifecycle/summary`
- `GET /api/proposal-lifecycle/events/stream` (WebSocket upgrade)
