import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendInterLaneExchangeEvidence,
  materializeInterLaneExchangeEnvelope,
  resolveInterLaneExchangeEvidenceLog,
  validateInterLaneExchangeEnvelope,
} from '../inter-lane-exchange';

describe('inter-lane exchange envelopes', () => {
  it('rejects non-canonical binding ids', () => {
    const validation = validateInterLaneExchangeEnvelope({
      exchange_id: 'exch-123',
      artifact_type: 'task_board_card',
      producer_binding_id: 'operations:foo',
      consumer_binding_id: 'engineering:operator',
      issued_at: '2026-03-17T10:00:00Z',
      expires_at: '2026-03-17T11:00:00Z',
      classification: 'internal_operational',
      integrity_hash: 'a'.repeat(64),
      evidence_ref: 'runtime/logs/task_runs/task-board-exchanges.jsonl',
      transport_auth_class: 'dashboard_api_token',
      approval_chain: [],
      nonce: 'nonce-123',
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('producer_binding_id must be a canonical VentureOS binding');
  });

  it('rejects issued_at values too far in the future', () => {
    const now = new Date('2026-03-17T10:00:00Z');
    const validation = validateInterLaneExchangeEnvelope({
      exchange_id: 'exch-future',
      artifact_type: 'task_board_card',
      producer_binding_id: 'operations:operator',
      consumer_binding_id: 'engineering:operator',
      issued_at: '2026-03-17T10:20:01Z',
      expires_at: '2026-03-17T11:20:01Z',
      classification: 'internal_operational',
      integrity_hash: 'b'.repeat(64),
      evidence_ref: 'runtime/logs/task_runs/task-board-exchanges.jsonl',
      transport_auth_class: 'dashboard_api_token',
      approval_chain: [],
      nonce: 'nonce-future',
    }, now);

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('issued_at cannot be more than 10 minutes in the future');
  });

  it('uses the resolved evidence log path when runtime log dir is overridden', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ventureos-exchange-'));
    process.env.VENTUREOS_RUNTIME_LOG_DIR = path.join(tmpDir, 'runtime', 'logs');

    try {
      const materialized = materializeInterLaneExchangeEnvelope({
        artifact_type: 'task_board_card',
        producer_binding_id: 'operations:operator',
        consumer_binding_id: 'engineering:operator',
        evidence_ref: resolveInterLaneExchangeEvidenceLog('task-board-exchanges').evidenceRef,
        payload: { task: 'demo' },
      });

      expect(materialized.ok).toBe(true);
      if (!materialized.ok) {
        throw new Error(materialized.error);
      }

      const logPath = appendInterLaneExchangeEvidence('task-board-exchanges', materialized.envelope, { task: 'demo' });
      expect(materialized.envelope.evidence_ref).toBe(logPath);
      expect(fs.existsSync(logPath)).toBe(true);
    } finally {
      delete process.env.VENTUREOS_RUNTIME_LOG_DIR;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
