# Nexus 2.0 M2 — Nexus Authority Plane

Issue: #285

## Implemented Modules

- `lib/authority-map.ts`
: canonical authority-action map (`propose`, `execute`, `approve`, `close`, `override`).
- `lib/policy-gate.ts`
: mission-scoped policy checks with machine-readable deny codes.
- `lib/nexus-arbiter.ts`
: arbitration decision helper + explicit human override path.

## Enforced Behavior

- Subordinate agents cannot self-finalize mission decisions (`approve` / `close` denied).
- Nexus can approve/close under policy gate.
- Human is the only actor permitted for `override`.
- Arbitration acceptance returns structured allow/deny outcomes.

## Validation

- `lib/__tests__/authority-plane.test.ts`
  - agent cannot close/approve
  - nexus approve/close allowed
  - machine-readable deny reason from policy gate
  - arbitration deny for unauthorized actor
  - explicit human override path verified

## Integration Note

`lib/arena/arena-runner.ts` now delegates acceptance checks to `lib/nexus-arbiter.ts`, so competition acceptance is governed by the same authority-plane rules.
