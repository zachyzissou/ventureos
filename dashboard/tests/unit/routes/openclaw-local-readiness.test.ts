import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleOpenclawLocalReadiness,
  type OpenclawLocalReadinessDeps,
  resolveOpenclawLocalReadinessReportDir,
} from '../../../server/routes/openclaw-local-readiness.js';

const tmpRoot = path.join(os.tmpdir(), `openclaw-local-readiness-${process.pid}`);

function createDeps(reportDir: string): OpenclawLocalReadinessDeps {
  return {
    reportDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
  };
}

function writeReport(reportDir: string, timestamp: string, report: Record<string, unknown>): void {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, `openclaw-local-smoke-${timestamp}.json`),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  fs.writeFileSync(path.join(reportDir, `openclaw-local-smoke-${timestamp}.md`), '# mock', 'utf8');
  fs.writeFileSync(path.join(reportDir, `openclaw-local-smoke-${timestamp}.svg`), '<svg/>', 'utf8');
}

describe('openclaw local readiness route', () => {
  beforeEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  it('routes only GET /api/openclaw-local-readiness', () => {
    const deps = createDeps(tmpRoot);
    const res = mockResponse();

    expect(handleOpenclawLocalReadiness(mockRequest({ url: '/api/scheduler-jobs' }), res, deps)).toBe(false);
    expect(handleOpenclawLocalReadiness(mockRequest({ url: '/api/openclaw-local-readiness', method: 'POST' }), res, deps)).toBe(false);
  });

  it('resolves report directory from OPENCLAW_LOCAL_READINESS_REPORT_DIR when set', () => {
    const resolved = resolveOpenclawLocalReadinessReportDir('/opt/ventureos', {
      OPENCLAW_LOCAL_READINESS_REPORT_DIR: '/var/ventureos-host/runtime/reports/openclaw-local-smoke',
    });
    expect(resolved).toBe('/var/ventureos-host/runtime/reports/openclaw-local-smoke');
  });

  it('resolves report directory from ventureos root when env override is missing', () => {
    const resolved = resolveOpenclawLocalReadinessReportDir('/opt/ventureos', {});
    expect(resolved).toBe('/opt/ventureos/runtime/reports/openclaw-local-smoke');
  });

  it('returns available=false when no artifacts exist', () => {
    const deps = createDeps(tmpRoot);
    const res = mockResponse();
    const handled = handleOpenclawLocalReadiness(
      mockRequest({ url: '/api/openclaw-local-readiness' }),
      res,
      deps,
    );

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ ok: boolean; available: boolean; reason: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.available).toBe(false);
    expect(body.reason).toBe('no-artifacts');
  });

  it('returns latest readiness summary with blockers and group rollups', () => {
    const reportDir = path.join(tmpRoot, 'reports');
    writeReport(reportDir, '20260222T010101Z', {
      generatedAt: '20260222T010101Z',
      summary: {
        profile: 'full',
        requiredFailures: 0,
        requiredSkipped: 0,
        warnings: 1,
        totalChecks: 3,
        passCount: 2,
        failCount: 1,
        skippedCount: 0,
        verdict: 'hold',
        readinessScore: 91,
        confidence: 'medium',
      },
      checks: [
        {
          id: 'dashboard-health',
          required: true,
          status: 'pass',
          group: 'apis',
          severity: 'critical',
          durationMs: 12,
          description: 'Dashboard health',
          detail: 'ok',
          likelyCause: 'n/a',
          nextCommand: 'curl /api/health',
          owner: 'Dashboard Ops',
        },
        {
          id: 'bridge-scheduler-jobs',
          required: false,
          status: 'fail',
          group: 'bridge',
          severity: 'warn',
          durationMs: 44,
          description: 'Bridge check',
          detail: 'missing token',
          likelyCause: 'token missing',
          nextCommand: 'export BRIDGE_TOKEN_FILE=...',
          owner: 'Bridge Ops',
        },
        {
          id: 'dashboard-live-telemetry-sse',
          required: true,
          status: 'pass',
          group: 'realtime',
          severity: 'critical',
          durationMs: 31,
          description: 'SSE check',
          detail: 'ok',
          likelyCause: 'n/a',
          nextCommand: 'curl -N /api/live-telemetry',
          owner: 'Telemetry Ops',
        },
      ],
    });
    writeReport(reportDir, '20260222T020202Z', {
      generatedAt: '20260222T020202Z',
      summary: {
        profile: 'bridge',
        requiredFailures: 1,
        requiredSkipped: 0,
        warnings: 0,
        totalChecks: 2,
        passCount: 1,
        failCount: 1,
        skippedCount: 0,
        verdict: 'blocked',
        readinessScore: 45,
        confidence: 'low',
      },
      checks: [
        {
          id: 'openclaw-gateway-status',
          required: true,
          status: 'fail',
          group: 'core',
          severity: 'critical',
          durationMs: 100,
          description: 'Gateway status',
          detail: 'service not loaded',
          likelyCause: 'gateway down',
          nextCommand: 'openclaw gateway status',
          owner: 'Platform Ops',
        },
        {
          id: 'dashboard-health',
          required: true,
          status: 'pass',
          group: 'apis',
          severity: 'critical',
          durationMs: 19,
          description: 'Dashboard health',
          detail: 'ok',
          likelyCause: 'n/a',
          nextCommand: 'curl /api/health',
          owner: 'Dashboard Ops',
        },
      ],
    });

    const deps = createDeps(reportDir);
    const res = mockResponse();
    const handled = handleOpenclawLocalReadiness(
      mockRequest({ url: '/api/openclaw-local-readiness' }),
      res,
      deps,
    );

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{
      ok: boolean;
      available: boolean;
      latest: {
        timestamp: string;
        artifacts: { json: string; markdown: string; svg: string; markdownExists: boolean; svgExists: boolean };
        summary: { verdict: string; readinessScore: number; confidence: string };
        checksByGroup: Array<{ id: string; pass: number; fail: number }>;
        blockers: Array<{ id: string; owner: string }>;
      };
    }>(res);

    expect(body.ok).toBe(true);
    expect(body.available).toBe(true);
    expect(body.latest.timestamp).toBe('20260222T020202Z');
    expect(body.latest.artifacts.json).toBe('openclaw-local-smoke-20260222T020202Z.json');
    expect(body.latest.artifacts.markdownExists).toBe(true);
    expect(body.latest.artifacts.svgExists).toBe(true);
    expect(body.latest.summary.verdict).toBe('blocked');
    expect(body.latest.summary.readinessScore).toBe(45);
    expect(body.latest.summary.confidence).toBe('low');
    expect(body.latest.blockers[0]?.id).toBe('openclaw-gateway-status');
    expect(body.latest.blockers[0]?.owner).toBe('Platform Ops');
    expect(body.latest.checksByGroup.find((row) => row.id === 'core')?.fail).toBe(1);
  });

  it('returns 500 for malformed report JSON', () => {
    const reportDir = path.join(tmpRoot, 'broken');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'openclaw-local-smoke-20260222T030303Z.json'),
      '{ invalid',
      'utf8',
    );

    const deps = createDeps(reportDir);
    const res = mockResponse();
    const handled = handleOpenclawLocalReadiness(
      mockRequest({ url: '/api/openclaw-local-readiness' }),
      res,
      deps,
    );

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(500);
    const body = parseJsonBody<{ ok: boolean; available: boolean; error: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.available).toBe(false);
    expect(body.error).toContain('Failed to read local readiness artifacts');
  });
});
