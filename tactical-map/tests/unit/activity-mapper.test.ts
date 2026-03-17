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
    expectActivity('venture_research', '', ActivityType.IDLE);
    expectActivity('venture_infrastructure', '   ', ActivityType.IDLE);
  });

  const cases: Array<{ agent: AgentId; label: string; expected: ActivityType }> = [
    // venture_research
    { agent: 'venture_research', label: 'Research: Phase 5 spec design', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'venture_research', label: 'Investigating data contract mismatches', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'venture_research', label: 'Multi-domain synthesis: spec + plan', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'venture_research', label: 'Outcome prediction for roadmap', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'venture_research', label: 'Literature review: pixi performance', expected: ActivityType.ORACLE_RESEARCH },
    { agent: 'venture_research', label: 'Analyzing pylon network drift', expected: ActivityType.ORACLE_ANALYZE },
    { agent: 'venture_research', label: 'Evaluate risk register', expected: ActivityType.ORACLE_ANALYZE },
    { agent: 'venture_research', label: 'Review: Phase 5.2 quality gates', expected: ActivityType.ORACLE_ANALYZE },
    { agent: 'venture_research', label: 'Write design spec for tactical map', expected: ActivityType.ORACLE_WRITE },
    { agent: 'venture_research', label: 'Draft: implementation notes', expected: ActivityType.ORACLE_WRITE },
    { agent: 'venture_research', label: 'Docs: update spec section', expected: ActivityType.ORACLE_WRITE },
    { agent: 'venture_research', label: 'Documentation: add ADR', expected: ActivityType.ORACLE_WRITE },
    { agent: 'venture_research', label: 'Spec: activity mapping', expected: ActivityType.ORACLE_WRITE },

    // venture_infrastructure
    { agent: 'venture_infrastructure', label: 'Deploy backup rotation v3', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'venture_infrastructure', label: 'Infrastructure: cron design', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'venture_infrastructure', label: 'Provision new endpoint', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'venture_infrastructure', label: 'Terraform tactical map route', expected: ActivityType.ATLAS_DEPLOY },
    { agent: 'venture_infrastructure', label: 'Monitoring: system status', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'venture_infrastructure', label: 'Health check /api/tactical-map', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'venture_infrastructure', label: 'Backup validation run', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'venture_infrastructure', label: 'Observability: metrics + tracing', expected: ActivityType.ATLAS_MONITOR },
    { agent: 'venture_infrastructure', label: 'Fix incident: db contention', expected: ActivityType.ATLAS_FIX },
    { agent: 'venture_infrastructure', label: 'Hotfix: API timeout', expected: ActivityType.ATLAS_FIX },
    { agent: 'venture_infrastructure', label: 'Rollback release', expected: ActivityType.ATLAS_FIX },
    { agent: 'venture_infrastructure', label: 'Mitigation plan for outage', expected: ActivityType.ATLAS_FIX },

    // venture_security
    { agent: 'venture_security', label: 'Security scan: audit endpoints', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'venture_security', label: 'Threat modeling: attack surface', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'venture_security', label: 'Policy: CSP compliance check', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'venture_security', label: 'Inspect headers for CORS', expected: ActivityType.SENTINEL_SCAN },
    { agent: 'venture_security', label: 'Block suspicious injection attempt', expected: ActivityType.SENTINEL_BLOCK },
    { agent: 'venture_security', label: 'Deny access to endpoint', expected: ActivityType.SENTINEL_BLOCK },
    { agent: 'venture_security', label: 'Quarantine compromised token', expected: ActivityType.SENTINEL_BLOCK },
    { agent: 'venture_security', label: 'Escalation: suspicious activity', expected: ActivityType.SENTINEL_ESCALATE },
    { agent: 'venture_security', label: 'Alert: critical auth failure', expected: ActivityType.SENTINEL_ESCALATE },
    { agent: 'venture_security', label: 'Security incident: breach', expected: ActivityType.SENTINEL_ESCALATE },

    // venture_evidence
    { agent: 'venture_evidence', label: 'Testing: integration test suite', expected: ActivityType.VERIFIER_TEST },
    { agent: 'venture_evidence', label: 'Unit test: activity-mapper', expected: ActivityType.VERIFIER_TEST },
    { agent: 'venture_evidence', label: 'Test coverage push', expected: ActivityType.VERIFIER_TEST },
    { agent: 'venture_evidence', label: 'CI pipeline build check', expected: ActivityType.VERIFIER_TEST },
    { agent: 'venture_evidence', label: 'Validate API contracts', expected: ActivityType.VERIFIER_VALIDATE },
    { agent: 'venture_evidence', label: 'Code review: renderer', expected: ActivityType.VERIFIER_VALIDATE },
    { agent: 'venture_evidence', label: 'Approve PR', expected: ActivityType.VERIFIER_VALIDATE },
    { agent: 'venture_evidence', label: 'Bug found: regression in camera', expected: ActivityType.VERIFIER_BUG },
    { agent: 'venture_evidence', label: 'Failure: flaky test in e2e', expected: ActivityType.VERIFIER_BUG },
    { agent: 'venture_evidence', label: 'Crash on load', expected: ActivityType.VERIFIER_BUG },
    { agent: 'venture_evidence', label: 'Error: parseMapState', expected: ActivityType.VERIFIER_BUG },

    // venture_memory
    { agent: 'venture_memory', label: 'Documentation: update README', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'venture_memory', label: 'Docs: keyboard shortcuts', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'venture_memory', label: 'Record decisions in ADR', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'venture_memory', label: 'Pattern cataloging: activity map', expected: ActivityType.ARCHIVIST_DOCUMENT },
    { agent: 'venture_memory', label: 'Organize vault: clean up notes', expected: ActivityType.ARCHIVIST_ORGANIZE },
    { agent: 'venture_memory', label: 'Structure docs folder', expected: ActivityType.ARCHIVIST_ORGANIZE },
    { agent: 'venture_memory', label: 'Sort files by category', expected: ActivityType.ARCHIVIST_ORGANIZE },
    { agent: 'venture_memory', label: 'Retrieve old spec from archive', expected: ActivityType.ARCHIVIST_RETRIEVE },
    { agent: 'venture_memory', label: 'Search for API contract doc', expected: ActivityType.ARCHIVIST_RETRIEVE },
    { agent: 'venture_memory', label: 'Cross-reference patterns', expected: ActivityType.ARCHIVIST_RETRIEVE },
    { agent: 'venture_memory', label: 'Lookup previous implementation', expected: ActivityType.ARCHIVIST_RETRIEVE },

    // venture_delivery
    { agent: 'venture_delivery', label: 'Implementation: building states', expected: ActivityType.SYNTH_CODE },
    { agent: 'venture_delivery', label: 'Code units.ts module', expected: ActivityType.SYNTH_CODE },
    { agent: 'venture_delivery', label: 'Compile TypeScript', expected: ActivityType.SYNTH_CODE },
    { agent: 'venture_delivery', label: 'Script creation: screenshot runner', expected: ActivityType.SYNTH_CODE },
    { agent: 'venture_delivery', label: 'Dashboard wiring', expected: ActivityType.SYNTH_CODE },
    { agent: 'venture_delivery', label: 'Prototype orbiting dots', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'venture_delivery', label: 'POC: particle pooling', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'venture_delivery', label: 'Experiment: blur filter', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'venture_delivery', label: 'Draft particle styles', expected: ActivityType.SYNTH_PROTOTYPE },
    { agent: 'venture_delivery', label: 'Iterating on animations', expected: ActivityType.SYNTH_ITERATE },
    { agent: 'venture_delivery', label: 'Refactor renderer modules', expected: ActivityType.SYNTH_ITERATE },
    { agent: 'venture_delivery', label: 'Optimize particle update loop', expected: ActivityType.SYNTH_ITERATE },
    { agent: 'venture_delivery', label: 'Improve performance', expected: ActivityType.SYNTH_ITERATE },

    // venture_strategy
    { agent: 'venture_strategy', label: 'Orchestrating: multi-agent review', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'venture_strategy', label: 'Mission coordination: phase 5.2', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'venture_strategy', label: 'Agent dispatch: send Oracle', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'venture_strategy', label: 'Assign tasks to team', expected: ActivityType.ECHO_ORCHESTRATE },
    { agent: 'venture_strategy', label: 'Strategic decisions: MVP scope', expected: ActivityType.ECHO_DECIDE },
    { agent: 'venture_strategy', label: 'Plan roadmap for replay', expected: ActivityType.ECHO_DECIDE },
    { agent: 'venture_strategy', label: 'Prioritization: P0 security', expected: ActivityType.ECHO_DECIDE },
    { agent: 'venture_strategy', label: 'Escalation: critical outage', expected: ActivityType.ECHO_ESCALATE },
    { agent: 'venture_strategy', label: 'Urgent: high priority incident', expected: ActivityType.ECHO_ESCALATE },
    { agent: 'venture_strategy', label: 'Alert: blocker found', expected: ActivityType.ECHO_ESCALATE },

    // venture_control
    { agent: 'venture_control', label: 'Coordinating agents', expected: ActivityType.NEXUS_COORDINATE },
    { agent: 'venture_control', label: 'Manage mission control', expected: ActivityType.NEXUS_COORDINATE },
    { agent: 'venture_control', label: 'Oversee dispatch queue', expected: ActivityType.NEXUS_COORDINATE },
    { agent: 'venture_control', label: 'Monitor heartbeat status', expected: ActivityType.NEXUS_MONITOR },
    { agent: 'venture_control', label: 'Dashboard overview', expected: ActivityType.NEXUS_MONITOR },
    { agent: 'venture_control', label: 'Check system', expected: ActivityType.NEXUS_MONITOR },
    { agent: 'venture_control', label: 'Alert: error detected', expected: ActivityType.NEXUS_ALERT },
    { agent: 'venture_control', label: 'Warning: degraded performance', expected: ActivityType.NEXUS_ALERT },
    { agent: 'venture_control', label: 'Overloaded: team capacity high', expected: ActivityType.NEXUS_ALERT }
  ];

  it.each(cases)('$agent → $expected: $label', ({ agent, label, expected }) => {
    expectActivity(agent, label, expected);
  });

  it('caps label length before regex matching (ReDoS hardening)', () => {
    const prefix = 'x'.repeat(MAX_SESSION_LABEL_CHARS);
    const longLabel = `${prefix} research: should not match because beyond cap`;
    expect(classifyActivity(longLabel, 'venture_research')).toBe(ActivityType.IDLE);

    const withinCap = `${'x'.repeat(MAX_SESSION_LABEL_CHARS - 20)} research`;
    expect(classifyActivity(withinCap, 'venture_research')).toBe(ActivityType.ORACLE_RESEARCH);
  });

  it('has 25+ patterns total', () => {
    const total = (Object.keys(ACTIVITY_PATTERNS) as AgentId[]).reduce(
      (sum, id) => sum + ACTIVITY_PATTERNS[id].length,
      0
    );
    expect(total).toBeGreaterThanOrEqual(25);
  });
});
