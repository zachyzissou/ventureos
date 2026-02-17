#!/usr/bin/env -S npx tsx
/**
 * Incident Report Bundle Generator — VentureOS Observability (Issue #195)
 *
 * Produces a compact, redacted incident bundle for operator triage.
 * Bundle contents:
 *   - Recent structured logs (configurable time window)
 *   - Health/config metadata (redacted)
 *   - Endpoint status snapshot
 *   - System resource snapshot
 *
 * Usage:
 *   npx tsx scripts/incident-report.ts [--window-minutes=30] [--output=/path/to/bundle.json]
 *   # Or via API: POST /api/incident-report
 *
 * All sensitive fields (tokens, keys, passwords) are automatically redacted.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

// CJS-compatible project root resolution
const projectRoot = path.resolve(__dirname, '..');

// ─── Redaction (inline to keep script self-contained) ────────────────────────

const REDACTED_KEYS = new Set([
  'token', 'password', 'secret', 'api_key', 'apikey', 'api-key',
  'authorization', 'cookie', 'set-cookie', 'x-api-key',
  'bridge_token', 'bridgetoken', 'dashboard_token',
  'private_key', 'privatekey', 'access_token', 'refresh_token',
  'session_token', 'jwt', 'bearer', 'credentials', 'ssn',
  'credit_card', 'creditcard',
]);

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /xoxb-[a-zA-Z0-9\-]+/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /glpat-[a-zA-Z0-9\-_]{20}/g,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
];

function redactValue(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactValue(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactObject(value);
    }
  }
  return result;
}

// ─── Bundle Sections ─────────────────────────────────────────────────────────

interface IncidentBundle {
  generatedAt: string;
  generator: string;
  windowMinutes: number;
  sections: {
    structuredLogs: unknown[];
    auditLogs: unknown[];
    systemSnapshot: Record<string, unknown>;
    configSnapshot: Record<string, unknown>;
    healthEndpoint: Record<string, unknown> | null;
    recentErrors: unknown[];
  };
}

function collectStructuredLogs(windowMinutes: number): unknown[] {
  // Read from stderr captured logs or structured log files
  const logDir = path.join(projectRoot, 'runtime', 'logs');
  const logs: unknown[] = [];
  const cutoff = Date.now() - windowMinutes * 60 * 1000;

  // Try reading the audit log (JSONL format)
  const auditLogPath = path.join(logDir, 'tactical-map-access.log');
  try {
    if (fs.existsSync(auditLogPath)) {
      const lines = fs.readFileSync(auditLogPath, 'utf8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const ts = entry.ts ? new Date(entry.ts).getTime() : 0;
          if (ts >= cutoff) {
            logs.push(redactObject(entry));
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch {
    // ignore
  }

  // Scan for any .log or .jsonl files in log directory
  try {
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log') || f.endsWith('.jsonl'));
      for (const file of files) {
        if (file === 'tactical-map-access.log') continue; // already handled
        const filePath = path.join(logDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) continue;
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').filter(l => l.trim()).slice(-200);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const ts = entry.timestamp ? new Date(entry.timestamp).getTime() :
                         entry.ts ? new Date(entry.ts).getTime() : 0;
              if (ts >= cutoff) {
                logs.push(redactObject(entry));
              }
            } catch {
              // Non-JSON line — include as raw text (redacted)
              logs.push({ raw: redactValue(line), source: file });
            }
          }
        } catch {
          // ignore unreadable files
        }
      }
    }
  } catch {
    // ignore
  }

  return logs.slice(-500); // cap at 500 entries
}

function collectSystemSnapshot(): Record<string, unknown> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const snapshot: Record<string, unknown> = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    uptime: os.uptime(),
    loadAvg: os.loadavg(),
    memory: {
      totalGB: (totalMem / 1073741824).toFixed(1),
      usedGB: ((totalMem - freeMem) / 1073741824).toFixed(1),
      freeGB: (freeMem / 1073741824).toFixed(1),
      percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    cpus: os.cpus().length,
  };

  // Disk usage
  try {
    const dfOut = execSync("df -k / 2>/dev/null | tail -1", { encoding: 'utf8', timeout: 5000 }).trim();
    const parts = dfOut.split(/\s+/);
    snapshot.disk = {
      usedKB: parseInt(parts[2] ?? '0'),
      totalKB: parseInt(parts[1] ?? '0'),
      percentStr: parts[4] ?? 'unknown',
    };
  } catch {
    snapshot.disk = null;
  }

  return snapshot;
}

function collectConfigSnapshot(): Record<string, unknown> {
  // Collect env vars related to VentureOS, but redact sensitive ones
  const safeEnv: Record<string, string> = {};
  const relevantPrefixes = ['VENTUREOS_', 'DASHBOARD_', 'BRIDGE_', 'OPENCLAW_', 'NODE_ENV'];
  for (const [key, value] of Object.entries(process.env)) {
    if (relevantPrefixes.some(p => key.startsWith(p)) || key === 'NODE_ENV') {
      if (REDACTED_KEYS.has(key.toLowerCase()) || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
        safeEnv[key] = '[REDACTED]';
      } else {
        safeEnv[key] = value ?? '';
      }
    }
  }

  return {
    environment: safeEnv,
    processId: process.pid,
    processUptime: process.uptime(),
    workingDirectory: process.cwd(),
  };
}

async function collectHealthEndpoint(): Promise<Record<string, unknown> | null> {
  const port = process.env.DASHBOARD_PORT ?? '8001';
  const host = process.env.DASHBOARD_HOST ?? '127.0.0.1';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`http://${host}:${port}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return await resp.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function generateIncidentBundle(windowMinutes: number = 30): Promise<IncidentBundle> {
  const structuredLogs = collectStructuredLogs(windowMinutes);
  const auditLogs: unknown[] = []; // audit logs already included in structuredLogs
  const systemSnapshot = collectSystemSnapshot();
  const configSnapshot = redactObject(collectConfigSnapshot()) as Record<string, unknown>;
  const healthEndpoint = await collectHealthEndpoint();
  const recentErrors = structuredLogs.filter(
    (entry: any) => entry?.level === 'error' || entry?.event?.includes('fail') || entry?.event?.includes('error')
  );

  return {
    generatedAt: new Date().toISOString(),
    generator: 'ventureos-incident-report/1.0.0',
    windowMinutes,
    sections: {
      structuredLogs,
      auditLogs,
      systemSnapshot,
      configSnapshot: configSnapshot,
      healthEndpoint,
      recentErrors,
    },
  };
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let windowMinutes = 30;
  let outputPath: string | null = null;

  for (const arg of args) {
    if (arg.startsWith('--window-minutes=')) {
      windowMinutes = parseInt(arg.split('=')[1]) || 30;
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1];
    }
  }

  console.error(`[incident-report] Generating bundle (window: ${windowMinutes}m)...`);
  const bundle = await generateIncidentBundle(windowMinutes);

  const json = JSON.stringify(bundle, null, 2);

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, json);
    console.error(`[incident-report] Bundle written to ${outputPath}`);
  } else {
    // Default: write to runtime/tmp with timestamp
    const tmpDir = path.join(projectRoot, 'runtime', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = path.join(tmpDir, `incident-bundle-${ts}.json`);
    fs.writeFileSync(defaultPath, json);
    console.error(`[incident-report] Bundle written to ${defaultPath}`);
  }
}

// Only run CLI if executed directly
if (require.main === module || process.argv[1]?.endsWith('incident-report.ts')) {
  main().catch((err) => {
    console.error('[incident-report] Fatal error:', err);
    process.exit(1);
  });
}
