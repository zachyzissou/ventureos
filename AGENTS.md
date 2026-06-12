# VentureOS Agent Guide

This repo is VentureOS: a TypeScript monorepo for multi-agent operations, dashboard observability, tactical command UX, and OpenClaw-integrated readiness workflows. Use GitHub Project #41 as the canonical status board.

## Codex Loop Gate

- Check Project #41 before non-trivial work. If Project reads fail, fall back to REST PR, issue, and workflow truth and say so.
- Treat issue #138 as the current roadmap source unless Project #41 says otherwise.
- Treat issue #640 and PR #650 as current active implementation surfaces until Project/PR truth changes.
- Use $slurpnet-project-truth-loop for repo, project, issue, PR, workflow, and documentation truth.
- Use $local-product-runtime-proof-loop for dashboard, tactical-map, OpenClaw readiness, browser-visible, or artifact-producing changes.
- Preserve unrelated dirty work and use clean worktrees for automation or broad edits.
- Do not treat repo-fixed, PR-fixed, dashboard-proven, OpenClaw-ready, merged, deployed, and project-done as the same state.

## Standard Proof Surfaces

- Project/status: `gh project view 41 --owner zachyzissou`
- Roadmap/status: issue #138, current active issue/PR, and README current-truth section.
- Repo checks: npm scripts, TypeScript/Jest/Playwright checks, and GitHub Actions.
- Runtime proof: dashboard/browser proof, tactical-map proof, OpenClaw local readiness reports, or generated artifacts when user-visible behavior changes.
- Docs truth: `docs/ROADMAP.md` and `docs/STATUS.md` are archived context unless refreshed.

## Done Means

- Required checks or the targeted local equivalent passed.
- Runtime/dashboard/OpenClaw proof is attached when behavior or readiness changes.
- Final status separates repo-fixed, PR-open, merged, dashboard-proven, OpenClaw-ready, deployed, and project-done.
