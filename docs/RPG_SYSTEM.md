# VentureOS Performance Overlay System

Last Updated: 2026-03-16
Status: Active
Lead: Venture Control

## Overview

The Performance Overlay System is the VentureOS layer that turns agent telemetry into a readable operational surface.

It exists to:
- show current agent performance in the dashboard and tactical map
- surface collaboration strength across agents through the Affinity Network
- support progression, history, and tactical overlay views without changing canonical agent IDs
- keep the presentation layer separate from execution authority and role policy

Canonical role and authority definitions live in:
- `docs/VentureOS_Role_Model_v1.md`
- `docs/VentureOS_Agent_Role_Registry_v1.json`
- `docs/VentureOS_RBAC_Spec_v1.md`

## Core components

### 1. Performance attributes

The overlay surfaces agent metrics derived from execution data. Current stored metrics still come from the historical RPG database, but the presentation layer should use neutral VentureOS language.

Recommended display labels:
- `knowledge_mastery` for memory depth and source coverage
- `energy` for responsiveness and recovery
- `shields` for reliability and trust
- `delivery_leverage` for execution quality and impact
- `task_reach` for scope and throughput

### 2. Affinity Network

The Affinity Network visualizes collaboration strength between agents.

It is used for:
- tactical-map bond rendering
- dashboard relationship inspection
- drift tracking across repeated collaborations or failures
- highlighting weak coordination paths that may need mediation or ownership changes

### 3. Tactical overlays

The tactical overlay combines:
- current performance metrics
- interaction logs
- escalation summaries
- affinity links

This gives operators a compact view of execution health without changing the underlying operational model.

## APIs

Primary endpoints:
- `GET /api/rpg/stats`
- `GET /api/rpg/affinity-network`
- `GET /api/rpg/tactical-overlay`
- `GET /api/rpg/protocols`
- `GET /api/rpg/escalations`

Legacy compatibility aliases may still exist in code paths or database schema while migrations are completed, but new docs and UI should use the neutral route and label set above.

## Storage notes

The current implementation still reads from the historical SQLite overlay database. That storage can be migrated incrementally as long as these invariants hold:
- canonical agent IDs stay stable
- presentation labels remain neutral
- dashboard and tactical-map consumers keep working during migration
- readiness/evidence logic does not depend on themed naming

## Tactical-map guidance

The tactical map should present this system as:
- agent network and telemetry, not themed faction imagery
- collaboration links, not lore-driven bonds
- operational overlays, not fictional unit classes

## Change control

Any future change to overlay naming, route contracts, or displayed metric labels must update:
- `docs/DASHBOARD.md`
- `docs/TACTICAL_MAP_ROADMAP.md`
- `tactical-map/docs/openapi.yaml`
- any affected dashboard or tactical-map UI copy
