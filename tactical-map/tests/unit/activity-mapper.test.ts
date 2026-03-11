import { describe, it, expect } from 'vitest';
import { classifyActivity, ActivityType, normalizeSessionLabel, MAX_SESSION_LABEL_CHARS, ACTIVITY_PATTERNS } from '@/data/activity-mapper';
import type { AgentId } from '@/config';

function expectActivity(agent: AgentId, label: string, expected: ActivityType) {
  expect(classifyActivity(label, agent)).toBe(expected);
}

describe('activity-mapper', () => {
  it('normalizes labels (trim, collapse ws, lowercase, cap length)', () => {
    const raw = '   Research:   Multi-domain   Synthesis   ';
    expect(normalizeSessionLabel(raw)).toBe('research: multi-domain synthesis');

    const long = 'x'.repeat(MAX_SESSION_LABEL_CHARS + 50);
    expect(normalizeSessionLabel(long)).toHaveLength(MAX_SESSION_LABEL_CHARS);
  });

  it('returns IDLE for unknown agent id', () => {
    expect(classifyActivity('Research: something', 'unknown-agent')).toBe(ActivityType.IDLE);
  });

  it('returns IDLE for empty labels', () => {
    expectActivity('oracle', '', ActivityType.IDLE);
    expectActivity('atlas', '   ', ActivityType.IDLE);
  });

  const cases: Array<{ agent: AgentId; label: string; expected: ActivityType }> = [
    // oracle
    { agent: 'oracle', label: 'Research: Phase 5 spec design', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'oracle', label: 'Investigating data contract mismatches', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'oracle', label: 'Multi-domain synthesis: spec + plan', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'oracle', label: 'Outcome prediction for roadmap', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'oracle', label: 'Literature review: pixi performance', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'oracle', label: 'Analyzing pylon network drift', expected: ActivityType.ORACLE_ANALYZE },
    { agent: 'oracle', label: 'Evaluate risk register', expected: ActivityType.ORACLE_ANALYZE },
    { agent: 'oracle', label: 'Review: Phase 5.2 quality gates', expected: ActivityType.ORACLE_ANALYZE },
    { agent: 'oracle', label: 'Write design spec for tactical map', expected: ActivityType.ORACLE_WRITE },
    { agent: 'oracle', label: 'Draft: implementation notes', expected: ActivityType.ORACLE_WRITE },
    { agent: 'oracle', label: 'Docs: update spec section', expected: ActivityType.ORACLE_WRITE },
    { agent: 'oracle', label: 'Documentation: add ADR', expected: ActivityType.ORACLE_WRITE },
    { agent: 'oracle', label: 'Spec: activity mapping', expected: ActivityType.ORACLE_WRITE },

    // atlas
    { agent: 'atlas', label: 'Deploy backup rotation v3', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'atlas', label: 'Infrastructure: cron design', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'atlas', label: 'Provision new endpoint', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'atlas', label: 'Terraform tactical map route', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'atlas', label: 'Monitoring: system status', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'atlas', label: 'Health check /api/tactical-map', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'atlas', label: 'Backup validation run', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'atlas', label: 'Observability: metrics + tracing', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'atlas', label: 'Fix incident: db contention', expected: ActivityType.ATLAS_FIX },
    { agent: 'atlas', label: 'Hotfix: API timeout', expected: ActivityType.ATLAS_FIX },
    { agent: 'atlas', label: 'Rollback release', expected: ActivityType.ATLAS_FIX },
    { agent: 'atlas', label: 'Mitigation plan for outage', expected: ActivityType.ATLAS_FIX },

    // sentinel
    { agent: 'sentinel', label: 'Security scan: audit endpoints', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'sentinel', label: 'Threat modeling: attack surface', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'sentinel', label: 'Policy: CSP compliance check', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'sentinel', label: 'Inspect headers for CORS', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'sentinel', label: 'Block suspicious injection attempt', expected: ActivityType.SENTINEL_BLOCK },
    { agent: 'sentinel', label: 'Deny access to endpoint', expected: ActivityType.SENTINEL_BLOCK },
    { agent: 'sentinel', label: 'Quarantine compromised token', expected: ActivityType.SENTINEL_BLOCK },
    { agent: 'sentinel', label: 'Escalation: suspicious activity', expected: ActivityType.SENTINEL_ESCALATE },
    { agent: 'sentinel', label: 'Alert: critical auth failure', expected: ActivityType.SENTINEL_ESCALATE },
    { agent: 'sentinel', label: 'Security incident: breach', expected: ActivityType.SENTINEL_ESCALATE },

    // verifier
    { agent: 'verifier', label: 'Testing: integration test suite', expected: ActivityType.VERIFIER_TEST },
    { agent: 'verifier', label: 'Unit test: activity-mapper', expected: ActivityType.VERIFIER_TEST },
    { agent: 'verifier', label: 'Test coverage push', expected: ActivityType.VERIFIER_TEST },
    { agent: 'verifier', label: 'CI pipeline build check', expected: ActivityType.VERIFIER_TEST },
    { agent: 'verifier', label: 'Validate API contracts', expected: ActivityType.VERIFIER_VALIDATE },
    { agent: 'verifier', label: 'Code review: renderer', expected: ActivityType.VERIFIER_VALIDATE },
    { agent: 'verifier', label: 'Approve PR', expected: ActivityType.VERIFIER_VALIDATE },
    { agent: 'verifier', label: 'Bug found: regression in camera', expected: ActivityType.VERIFIER_BUG },
    { agent: 'verifier', label: 'Failure: flaky test in e2e', expected: ActivityType.VERIFIER_BUG },
    { agent: 'verifier', label: 'Crash on load', expected: ActivityType.VERIFIER_BUG },
    { agent: 'verifier', label: 'Error: parseMapState', expected: ActivityType.VERIFIER_BUG },

    // archivist
    { agent: 'archivist', label: 'Documentation: update README', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'archivist', label: 'Docs: keyboard shortcuts', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'archivist', label: 'Record decisions in ADR', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'archivist', label: 'Pattern cataloging: activity map', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'archivist', label: 'Organize vault: clean up notes', expected: ActivityType.ARCHIVIST_ORGANIZE },
    { agent: 'archivist', label: 'Structure docs folder', expected: ActivityType.ARCHIVIST_ORGANIZE },
    { agent: 'archivist', label: 'Sort files by category', expected: ActivityType.ARCHIVIST_ORGANIZE },
    { agent: 'archivist', label: 'Retrieve old spec from archive', expected: ActivityType.ARCHIVIST_RETRIEVE },
    { agent: 'archivist', label: 'Search for API contract doc', expected: ActivityType.ARCHIVIST_RETRIEVE },
    { agent: 'archivist', label: 'Cross-reference patterns', expected: ActivityType.ARCHIVIST_RETRIEVE },
    { agent: 'archivist', label: 'Lookup previous implementation', expected: ActivityType.ARCHIVIST_RETRIEVE },

    // synth
    { agent: 'synth', label: 'Implementation: building states', expected: ActivityType.SYNTH_CODE },
    { agent: 'synth', label: 'Code units.ts module', expected: ActivityType.SYNTH_CODE },
    { agent: 'synth', label: 'Compile TypeScript', expected: ActivityType.SYNTH_CODE },
    { agent: 'synth', label: 'Script creation: screenshot runner', expected: ActivityType.SYNTH_CODE },
    { agent: 'synth', label: 'Dashboard wiring', expected: ActivityType.SYNTH_CODE },
    { agent: 'synth', label: 'Prototype orbiting dots', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'synth', label: 'POC: particle pooling', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'synth', label: 'Experiment: blur filter', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'synth', label: 'Draft particle styles', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'synth', label: 'Iterating on animations', expected: ActivityType.SYNTH_ITERATE },
    { agent: 'synth', label: 'Refactor renderer modules', expected: ActivityType.SYNTH_ITERATE },
    { agent: 'synth', label: 'Optimize particle update loop', expected: ActivityType.SYNTH_ITERATE },
    { agent: 'synth', label: 'Improve performance', expected: ActivityType.SYNTH_ITERATE },

    // echo
    { agent: 'echo', label: 'Orchestrating: multi-agent review', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'echo', label: 'Mission coordination: phase 5.2', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'echo', label: 'Agent dispatch: send Oracle', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'echo', label: 'Assign tasks to team', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'echo', label: 'Strategic decisions: MVP scope', expected: ActivityType.ECHO_DECIDE },
    { agent: 'echo', label: 'Plan roadmap for replay', expected: ActivityType.ECHO_DECIDE },
    { agent: 'echo', label: 'Prioritization: P0 security', expected: ActivityType.ECHO_DECIDE },
    { agent: 'echo', label: 'Escalation: critical outage', expected: ActivityType.ECHO_ESCALATE },
    { agent: 'echo', label: 'Urgent: high priority incident', expected: ActivityType.ECHO_ESCALATE },
    { agent: 'echo', label: 'Alert: blocker found', expected: ActivityType.ECHO_ESCALATE },

    // nexus
    { agent: 'nexus', label: 'Coordinating agents', expected: ActivityType.NEXUS_COORDINATE },
    { agent: 'nexus', label: 'Manage mission control', expected: ActivityType.NEXUS_COORDINATE },
    { agent: 'nexus', label: 'Oversee dispatch queue', expected: ActivityType.NEXUS_COORDINATE },
    { agent: 'nexus', label: 'Monitor heartbeat status', expected: ActivityType.NEXUS_MONITOR },
    { agent: 'nexus', label: 'Dashboard overview', expected: ActivityType.NEXUS_MONITOR },
    { agent: 'nexus', label: 'Check system', expected: ActivityType.NEXUS_MONITOR },
    { agent: 'nexus', label: 'Alert: error detected', expected: ActivityType.NEXUS_ALERT },
    { agent: 'nexus', label: 'Warning: degraded performance', expected: ActivityType.NEXUS_ALERT },
    { agent: 'nexus', label: 'Overloaded: team capacity high', expected: ActivityType.NEXUS_ALERT }
  ];

  it.each(cases)('$agent → $expected: $label', ({ agent, label, expected }) => {
    expectActivity(agent, label, expected);
  });

  it('caps label length before regex matching (ReDoS hardening)', () => {
    const prefix = 'x'.repeat(MAX_SESSION_LABEL_CHARS);
    const longLabel = `${prefix} research: should not match because beyond cap`;
    expect(classifyActivity(longLabel, 'oracle')).toBe(ActivityType.IDLE);

    const withinCap = `${'x'.repeat(MAX_SESSION_LABEL_CHARS - 20)} research`;
    expect(classifyActivity(withinCap, 'oracle')).toBe(ActivityType.ORACLE_RESEARCH);
  });

  it('has 25+ patterns total', () => {
    const total = (Object.keys(ACTIVITY_PATTERNS) as AgentId[]).reduce(
      (sum, id) => sum + ACTIVITY_PATTERNS[id].length,
      0
    );
    expect(total).toBeGreaterThanOrEqual(25);
  });
});
