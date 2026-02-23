#!/usr/bin/env node
/**
 * phantom-detector.mjs — Detect phantom sessions from OpenClaw gateway logs
 * 
 * Scans gateway.err.log and gateway.log for:
 * - Sessions that were spawned but never produced output
 * - Lane contention warnings exceeding thresholds
 * - Embedded run timeouts
 * - Slow Discord listeners
 * 
 * Usage:
 *   node scripts/phantom-detector.mjs [--log-dir <path>] [--threshold-minutes <N>] [--json] [--alert]
 * 
 * Options:
 *   --log-dir           Path to OpenClaw logs (default: ~/.openclaw/logs)
 *   --threshold-minutes Phantom detection threshold in minutes (default: 5)
 *   --json              Output as JSON
 *   --alert             Write alert to phantom-alerts.jsonl
 *   --since             Only check logs since this ISO date (default: 24h ago)
 */

import { readFile, appendFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}
const hasFlag = (name) => args.includes(`--${name}`);

const LOG_DIR = getArg('log-dir', join(homedir(), '.openclaw', 'logs'));
const THRESHOLD_MINUTES = parseInt(getArg('threshold-minutes', '5'), 10);
const OUTPUT_JSON = hasFlag('json');
const SHOULD_ALERT = hasFlag('alert');
const SINCE = getArg('since', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

const sinceTs = new Date(SINCE).getTime();

// ---------- Log Parsing ----------

function parseTimestamp(line) {
  // Matches ISO timestamps at start of line OR immediately after '[' (e.g., "[2026-02-15T01:02:03.456Z]")
  const m = line.match(/(?:^|\[)(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)/);
  if (!m) return null;
  const ts = Date.parse(m[1]);
  return Number.isFinite(ts) ? ts : null;
}

function extractSessionUUID(line) {
  const m = line.match(/session\s+([0-9a-f]{8})/i);
  if (m) return m[1];
  const m2 = line.match(/subagent:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  if (m2) return m2[1].slice(0, 8);
  return null;
}

async function readLogFile(filename) {
  const path = join(LOG_DIR, filename);
  try {
    await stat(path);
    return (await readFile(path, 'utf-8')).split('\n');
  } catch {
    return [];
  }
}

// ---------- Detection ----------

async function detectPhantoms() {
  const errLines = await readLogFile('gateway.err.log');
  const logLines = await readLogFile('gateway.log');
  
  const phantoms = new Map(); // uuid -> { firstSeen, lastSeen, errors[], resolved }
  const laneWarnings = [];
  const runTimeouts = [];
  const slowListeners = [];

  // Scan error log for PHANTOM markers and lane warnings
  for (const line of errLines) {
    const ts = parseTimestamp(line);
    if (ts === null) continue;
    if (ts < sinceTs) continue;

    // PHANTOM detection
    if (line.includes('PHANTOM:')) {
      const uuid = extractSessionUUID(line);
      if (uuid) {
        if (!phantoms.has(uuid)) {
          phantoms.set(uuid, { 
            firstSeen: ts, 
            lastSeen: ts, 
            errors: [line.trim()], 
            resolved: false 
          });
        } else {
          const entry = phantoms.get(uuid);
          entry.lastSeen = ts;
          entry.errors.push(line.trim());
        }
      }
    }

    // Lane contention
    if (line.includes('lane wait exceeded')) {
      const waitMatch = line.match(/waitedMs=(\d+)/);
      const laneMatch = line.match(/lane=(\S+)/);
      const queueMatch = line.match(/queueAhead=(\d+)/);
      if (waitMatch && laneMatch) {
        laneWarnings.push({
          timestamp: ts,
          lane: laneMatch[1],
          waitedMs: parseInt(waitMatch[1], 10),
          queueAhead: queueMatch ? parseInt(queueMatch[1], 10) : 0
        });
      }
    }

    // Embedded run timeouts
    if (line.includes('embedded run timeout')) {
      const runMatch = line.match(/runId=(\S+)/);
      const timeoutMatch = line.match(/timeoutMs=(\d+)/);
      if (runMatch) {
        runTimeouts.push({
          timestamp: ts,
          runId: runMatch[1],
          timeoutMs: timeoutMatch ? parseInt(timeoutMatch[1], 10) : 0
        });
      }
    }

    // Slow Discord listeners
    if (line.includes('Slow listener')) {
      const durationMatch = line.match(/took ([\d.]+) seconds/);
      if (durationMatch) {
        slowListeners.push({
          timestamp: ts,
          durationSeconds: parseFloat(durationMatch[1])
        });
      }
    }
  }

  // Scan main log for session activity (resolved phantoms)
  for (const line of logLines) {
    const ts = parseTimestamp(line);
    if (ts === null) continue;
    if (ts < sinceTs) continue;

    // Check if any phantom session eventually produced output
    for (const [uuid, entry] of phantoms) {
      if (line.includes(uuid) && line.includes('[agent:nested]')) {
        entry.resolved = true;
        entry.resolvedAt = ts;
      }
    }

    // Session Send timeouts
    if (line.includes('Session Send') && line.includes('failed: timeout')) {
      const uuid = extractSessionUUID(line);
      if (uuid && phantoms.has(uuid)) {
        phantoms.get(uuid).sendTimeout = true;
      }
    }
  }

  return { phantoms, laneWarnings, runTimeouts, slowListeners };
}

// ---------- Analysis ----------

function analyzeResults({ phantoms, laneWarnings, runTimeouts, slowListeners }) {
  const nowTs = Date.now();
  const thresholdMs = Math.max(0, THRESHOLD_MINUTES) * 60 * 1000;

  const activePhantoms = [...phantoms.entries()]
    .filter(([, v]) => !v.resolved)
    // Only flag phantoms that have persisted longer than the threshold.
    .filter(([, v]) => thresholdMs === 0 || (nowTs - v.firstSeen) >= thresholdMs)
    .map(([uuid, v]) => ({
      uuid,
      firstSeen: new Date(v.firstSeen).toISOString(),
      lastSeen: new Date(v.lastSeen).toISOString(),
      durationMinutes: Math.round((v.lastSeen - v.firstSeen) / 60000),
      errorCount: v.errors.length,
      sendTimeout: v.sendTimeout || false
    }));

  const resolvedPhantoms = [...phantoms.entries()]
    .filter(([, v]) => v.resolved)
    .map(([uuid, v]) => ({
      uuid,
      firstSeen: new Date(v.firstSeen).toISOString(),
      resolvedAt: v.resolvedAt ? new Date(v.resolvedAt).toISOString() : 'unknown',
      startDelayMinutes: v.resolvedAt ? Math.round((v.resolvedAt - v.firstSeen) / 60000) : null
    }));

  const laneStats = {};
  for (const w of laneWarnings) {
    const lane = w.lane;
    if (!laneStats[lane]) {
      laneStats[lane] = { count: 0, maxWaitMs: 0, avgWaitMs: 0, totalWaitMs: 0 };
    }
    laneStats[lane].count++;
    laneStats[lane].maxWaitMs = Math.max(laneStats[lane].maxWaitMs, w.waitedMs);
    laneStats[lane].totalWaitMs += w.waitedMs;
    laneStats[lane].avgWaitMs = Math.round(laneStats[lane].totalWaitMs / laneStats[lane].count);
  }

  const slowListenerStats = {
    count: slowListeners.length,
    maxSeconds: slowListeners.length ? Math.max(...slowListeners.map(s => s.durationSeconds)) : 0,
    avgSeconds: slowListeners.length ? Math.round(slowListeners.reduce((sum, s) => sum + s.durationSeconds, 0) / slowListeners.length * 10) / 10 : 0,
    over60sCount: slowListeners.filter(s => s.durationSeconds > 60).length
  };

  return {
    summary: {
      scanPeriod: SINCE,
      thresholdMinutes: THRESHOLD_MINUTES,
      totalPhantoms: phantoms.size,
      activePhantoms: activePhantoms.length,
      resolvedPhantoms: resolvedPhantoms.length,
      laneWarnings: laneWarnings.length,
      runTimeouts: runTimeouts.length,
      slowListeners: slowListeners.length,
      healthStatus: activePhantoms.length > 0 ? 'UNHEALTHY' : 
                    laneWarnings.filter(w => w.waitedMs > 60000).length >= 5 ? 'DEGRADED' : 'HEALTHY'
    },
    activePhantoms,
    resolvedPhantoms,
    laneContention: laneStats,
    slowListenerStats,
    runTimeouts: runTimeouts.length > 10 ? runTimeouts.slice(-10) : runTimeouts
  };
}

// ---------- Output ----------

function formatHumanReport(analysis) {
  const lines = [];
  const h = analysis.summary.healthStatus;
  const icon = h === 'HEALTHY' ? '✅' : h === 'DEGRADED' ? '⚠️' : '🚨';
  
  lines.push(`${icon} Phantom Session Health: ${h}`);
  lines.push(`   Scan period: since ${analysis.summary.scanPeriod}`);
  lines.push(`   Phantoms: ${analysis.summary.activePhantoms} active, ${analysis.summary.resolvedPhantoms} resolved`);
  lines.push(`   Lane warnings: ${analysis.summary.laneWarnings}`);
  lines.push(`   Run timeouts: ${analysis.summary.runTimeouts}`);
  lines.push(`   Slow listeners: ${analysis.summary.slowListeners}`);
  lines.push('');

  if (analysis.activePhantoms.length > 0) {
    lines.push('🚨 ACTIVE PHANTOM SESSIONS:');
    for (const p of analysis.activePhantoms) {
      lines.push(`   ${p.uuid} — first seen ${p.firstSeen}, ${p.errorCount} errors, ${p.sendTimeout ? 'SEND TIMEOUT' : 'no timeout'}`);
    }
    lines.push('');
  }

  if (analysis.resolvedPhantoms.length > 0) {
    lines.push('🟡 RESOLVED PHANTOMS (slow starts):');
    for (const p of analysis.resolvedPhantoms) {
      lines.push(`   ${p.uuid} — delayed ${p.startDelayMinutes ?? '?'} min, resolved at ${p.resolvedAt}`);
    }
    lines.push('');
  }

  if (Object.keys(analysis.laneContention).length > 0) {
    lines.push('📊 LANE CONTENTION:');
    for (const [lane, stats] of Object.entries(analysis.laneContention)) {
      lines.push(`   ${lane}: ${stats.count} warnings, max ${Math.round(stats.maxWaitMs/1000)}s, avg ${Math.round(stats.avgWaitMs/1000)}s`);
    }
    lines.push('');
  }

  if (analysis.slowListenerStats.count > 0) {
    const s = analysis.slowListenerStats;
    lines.push(`📡 DISCORD LISTENERS: ${s.count} slow, ${s.over60sCount} over 60s, max ${s.maxSeconds}s, avg ${s.avgSeconds}s`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- Alert ----------

async function writeAlert(analysis) {
  if (analysis.summary.activePhantoms === 0 && analysis.summary.healthStatus === 'HEALTHY') return;
  
  const alertPath = join(LOG_DIR, '..', 'phantom-alerts.jsonl');
  const alert = {
    timestamp: new Date().toISOString(),
    type: 'phantom-detector',
    health: analysis.summary.healthStatus,
    activePhantoms: analysis.summary.activePhantoms,
    laneWarnings: analysis.summary.laneWarnings,
    details: analysis.summary
  };
  
  await appendFile(alertPath, JSON.stringify(alert) + '\n');
  return alertPath;
}

// ---------- Session Health Check via OpenClaw CLI ----------

async function checkActiveSessionHealth() {
  try {
    const result = execSync('openclaw sessions --active 60 --json 2>/dev/null', { 
      encoding: 'utf-8',
      timeout: 10000 
    });
    const data = JSON.parse(result);
    return {
      activeSessions: data.count || 0,
      sessions: (data.sessions || []).map(s => ({
        key: s.key || s.sessionKey,
        updatedAt: s.updatedAt,
        messageCount: s.messageCount ?? s.messages ?? 'unknown'
      }))
    };
  } catch {
    return { activeSessions: -1, sessions: [], error: 'Failed to query sessions' };
  }
}

// ---------- Main ----------

async function main() {
  const results = await detectPhantoms();
  const analysis = analyzeResults(results);
  
  // Add active session health
  analysis.activeSessionHealth = await checkActiveSessionHealth();

  if (OUTPUT_JSON) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log(formatHumanReport(analysis));
    if (analysis.activeSessionHealth.error) {
      console.log(`⚠️  Session query: ${analysis.activeSessionHealth.error}`);
    } else {
      console.log(`📋 Active sessions (last 60m): ${analysis.activeSessionHealth.activeSessions}`);
    }
  }

  if (SHOULD_ALERT) {
    const alertPath = await writeAlert(analysis);
    if (alertPath && !OUTPUT_JSON) {
      console.log(`\n📝 Alert written to: ${alertPath}`);
    }
  }

  // Exit code: 1 if unhealthy, 0 otherwise
  const exitCode = analysis.summary.healthStatus === 'UNHEALTHY' ? 1 : 0;
  // Ensure all writes flush before exit
  await new Promise(resolve => setTimeout(resolve, 50));
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Phantom detector error:', err.message);
  process.exit(2);
});
