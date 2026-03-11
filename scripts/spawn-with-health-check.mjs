#!/usr/bin/env node
/**
 * spawn-with-health-check.mjs — Enhanced spawn wrapper with workspace health pre-check
 *
 * Features:
 * 1. Pre-spawn workspace health check (fail fast if bloated)
 * 2. Delegates to sessions_spawn via openclaw CLI
 * 3. Post-spawn verification (polls for messages > 0, up to 15s)
 * 4. Retry 3x with exponential backoff (2s, 5s, 10s) if phantom
 * 5. JSONL audit logging
 * 6. Returns structured result
 *
 * Usage:
 *   node spawn-with-health-check.mjs \
 *     --agent <agent> \
 *     --prompt <prompt> \
 *     [--model <model>] \
 *     [--max-retries <n>] \
 *     [--verify-timeout <ms>] \
 *     [--skip-health-check] \
 *     [--json]
 *
 * Exit codes:
 *   0 = Success — session spawned and verified
 *   1 = All retries exhausted (phantom on every attempt)
 *   2 = Workspace unhealthy (fail fast)
 *   3 = Configuration/argument error
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn as spawnChild } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";

// ============================================================================
// Configuration
// ============================================================================

const WORKSPACE_BASE = path.join(os.homedir(), ".openclaw");
const HEALTH_SCRIPT = path.join(os.homedir(), "clawd/ventureos/scripts/check-workspace-health.sh");
const LOG_DIR = path.join(os.homedir(), "clawd/ventureos/runtime/logs");
const LOG_FILE = path.join(LOG_DIR, "spawn-health-check.jsonl");

const BACKOFF_MS = [2000, 5000, 10000];
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_VERIFY_TIMEOUT_MS = 15000;
const VERIFY_POLL_INTERVAL_MS = 2000;
const WORKSPACE_THRESHOLD_MB = 500;
const FILE_THRESHOLD_MB = 50;

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(argv) {
  const opts = {
    agent: null,
    prompt: null,
    model: null,
    maxRetries: DEFAULT_MAX_RETRIES,
    verifyTimeoutMs: DEFAULT_VERIFY_TIMEOUT_MS,
    skipHealthCheck: false,
    json: false,
    quiet: false,
    extraArgs: [],
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--agent": opts.agent = argv[++i]; break;
      case "--prompt": opts.prompt = argv[++i]; break;
      case "--model": opts.model = argv[++i]; break;
      case "--max-retries": opts.maxRetries = parseInt(argv[++i], 10); break;
      case "--verify-timeout": opts.verifyTimeoutMs = parseInt(argv[++i], 10); break;
      case "--skip-health-check": opts.skipHealthCheck = true; break;
      case "--json": opts.json = true; break;
      case "--quiet": opts.quiet = true; break;
      case "-h": case "--help": usage(); break;
      default: opts.extraArgs.push(a);
    }
  }

  if (!opts.agent) {
    console.error("Error: --agent is required");
    process.exit(3);
  }
  if (!opts.prompt) {
    console.error("Error: --prompt is required");
    process.exit(3);
  }

  return opts;
}

function usage() {
  console.log(`spawn-with-health-check.mjs — Spawn with workspace health pre-check + phantom retry

Usage:
  node spawn-with-health-check.mjs --agent <agent> --prompt <prompt> [options]

Options:
  --agent <name>           Target agent (required)
  --prompt <text>          Spawn prompt (required)
  --model <model>          Model override (e.g., anthropic/claude-sonnet-4-5)
  --max-retries <n>        Max retry attempts (default: ${DEFAULT_MAX_RETRIES})
  --verify-timeout <ms>    Verification timeout in ms (default: ${DEFAULT_VERIFY_TIMEOUT_MS})
  --skip-health-check      Skip workspace health pre-check
  --json                   Machine-readable JSON output
  --quiet                  Suppress progress output
  -h, --help               Show this help

Exit codes:
  0 = Success (session spawned and messages > 0 verified)
  1 = All retries exhausted (phantom detected on every attempt)
  2 = Workspace unhealthy (pre-check failed, no spawn attempted)
  3 = Configuration error
`);
  process.exit(0);
}

// ============================================================================
// Logging
// ============================================================================

function log(record) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
}

function info(msg, opts) {
  if (!opts.quiet) console.error(`[spawn-health] ${msg}`);
}

// ============================================================================
// Workspace Health Check
// ============================================================================

function checkWorkspaceHealth(agent) {
  const workspace = path.join(WORKSPACE_BASE, `workspace-${agent}`);

  if (!fs.existsSync(workspace)) {
    return { healthy: true, reason: "workspace_not_found_but_ok" };
  }

  // Quick size check without calling the full script
  try {
    const output = execSync(`du -sk "${workspace}" 2>/dev/null`, {
      encoding: "utf8",
      timeout: 10000,
    }).trim();
    const kb = parseInt(output.split("\t")[0], 10);
    const mb = kb / 1024;

    if (mb > WORKSPACE_THRESHOLD_MB) {
      return {
        healthy: false,
        reason: `workspace_size_${Math.round(mb)}MB_exceeds_${WORKSPACE_THRESHOLD_MB}MB`,
        sizeMB: Math.round(mb),
      };
    }

    // Check for large DB files
    const dbFiles = execSync(
      `find "${workspace}" -type f \\( -name "*.sqlite" -o -name "*.sqlite3" -o -name "*.db" \\) -size +10M 2>/dev/null || true`,
      { encoding: "utf8", timeout: 10000 }
    ).trim();

    if (dbFiles) {
      const files = dbFiles.split("\n").filter(Boolean);
      return {
        healthy: false,
        reason: `large_db_files_found`,
        files: files.map((f) => f.replace(workspace + "/", "")),
      };
    }

    return { healthy: true, sizeMB: Math.round(mb) };
  } catch (err) {
    // If health check itself fails, don't block spawn
    return { healthy: true, reason: "health_check_error_passthrough", error: err.message };
  }
}

// ============================================================================
// Spawn session via openclaw CLI
// ============================================================================

function spawnSession(agent, prompt, model) {
  return new Promise((resolve) => {
    const args = ["sessions", "spawn", "--agent", agent, "--prompt", prompt];
    if (model) {
      args.push("--model", model);
    }

    let stdout = "";
    let stderr = "";
    const startMs = Date.now();

    const child = spawnChild("openclaw", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      // Try to extract session key from output
      // openclaw sessions spawn typically outputs JSON or a session key
      let sessionKey = null;
      try {
        const parsed = JSON.parse(stdout);
        sessionKey = parsed.sessionKey || parsed.childSessionKey || parsed.key || null;
      } catch {
        // Try regex extraction from stdout
        const match = stdout.match(/agent:[a-z]+:subagent:[a-f0-9-]+/);
        if (match) sessionKey = match[0];
      }

      resolve({
        code: code || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        sessionKey,
        durationMs: Date.now() - startMs,
      });
    });

    child.on("error", (err) => {
      resolve({
        code: 1,
        stdout: "",
        stderr: err.message,
        sessionKey: null,
        durationMs: Date.now() - startMs,
      });
    });
  });
}

// ============================================================================
// Verify session has messages > 0
// ============================================================================

async function verifySession(sessionKey, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;

  while (Date.now() < deadline) {
    try {
      const output = execSync(
        `openclaw sessions history --session "${sessionKey}" --limit 1 2>/dev/null`,
        { encoding: "utf8", timeout: 5000 }
      ).trim();

      // Check if we got any messages back
      if (output && output.length > 10) {
        // Try to parse as JSON
        try {
          const parsed = JSON.parse(output);
          const messages = Array.isArray(parsed) ? parsed : (parsed.messages || []);
          lastCount = messages.length;
          if (lastCount > 0) {
            return { verified: true, messageCount: lastCount };
          }
        } catch {
          // If it's not JSON but has content, it might be a message
          if (output.includes("assistant") || output.includes("human") || output.includes("role")) {
            return { verified: true, messageCount: 1 };
          }
        }
      }
    } catch {
      // Command failed, keep polling
    }

    // Wait before next poll
    await new Promise((r) => setTimeout(r, VERIFY_POLL_INTERVAL_MS));
  }

  return { verified: false, messageCount: lastCount };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const opts = parseArgs(process.argv);
  const runId = `shc-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();

  info(`Run ${runId}: spawning ${opts.agent}`, opts);

  // ── Step 1: Workspace health pre-check ──
  if (!opts.skipHealthCheck) {
    info(`Checking workspace health for ${opts.agent}...`, opts);
    const health = checkWorkspaceHealth(opts.agent);

    log({
      ts: new Date().toISOString(),
      event: "health_check",
      runId,
      agent: opts.agent,
      ...health,
    });

    if (!health.healthy) {
      const msg = `Workspace unhealthy: ${health.reason}`;
      info(`❌ ${msg}`, opts);

      const result = {
        ok: false,
        runId,
        agent: opts.agent,
        exitReason: "workspace_unhealthy",
        health,
        startedAt,
      };

      log({ ts: new Date().toISOString(), event: "spawn_blocked", runId, ...result });

      if (opts.json) {
        console.log(JSON.stringify(result));
      } else {
        console.error(`SPAWN_BLOCKED: ${msg}`);
      }
      process.exit(2);
    }

    info(`✅ Workspace healthy (${health.sizeMB || "?"}MB)`, opts);
  }

  // ── Step 2: Spawn with retry loop ──
  const totalAttempts = opts.maxRetries + 1;
  let lastSpawnResult = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const attemptStart = new Date().toISOString();
    info(`Attempt ${attempt}/${totalAttempts}: spawning...`, opts);

    log({
      ts: attemptStart,
      event: "spawn_attempt",
      runId,
      agent: opts.agent,
      attempt,
      totalAttempts,
      model: opts.model,
    });

    // Spawn
    const spawnResult = await spawnSession(opts.agent, opts.prompt, opts.model);
    lastSpawnResult = spawnResult;

    if (spawnResult.code !== 0 || !spawnResult.sessionKey) {
      info(`❌ Spawn failed (exit ${spawnResult.code})`, opts);
      log({
        ts: new Date().toISOString(),
        event: "spawn_failed",
        runId,
        attempt,
        exitCode: spawnResult.code,
        stderr: spawnResult.stderr.slice(0, 500),
      });

      if (attempt < totalAttempts) {
        const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
        info(`Retrying in ${backoff}ms...`, opts);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      break;
    }

    info(`Spawn returned key: ${spawnResult.sessionKey}`, opts);

    // ── Step 3: Verify messages > 0 ──
    info(`Verifying session has messages (timeout: ${opts.verifyTimeoutMs}ms)...`, opts);
    const verification = await verifySession(spawnResult.sessionKey, opts.verifyTimeoutMs);

    if (verification.verified) {
      // ── SUCCESS ──
      const result = {
        ok: true,
        runId,
        agent: opts.agent,
        sessionKey: spawnResult.sessionKey,
        attempt,
        retriesUsed: attempt - 1,
        messageCount: verification.messageCount,
        startedAt,
        completedAt: new Date().toISOString(),
      };

      log({ ts: new Date().toISOString(), event: "spawn_verified", runId, ...result });

      if (opts.json) {
        console.log(JSON.stringify(result));
      } else {
        console.log(`SPAWN_OK session=${spawnResult.sessionKey} attempt=${attempt} messages=${verification.messageCount}`);
      }
      process.exit(0);
    }

    // Phantom detected
    info(`⚠️ PHANTOM: session ${spawnResult.sessionKey} has 0 messages after ${opts.verifyTimeoutMs}ms`, opts);
    log({
      ts: new Date().toISOString(),
      event: "phantom_detected",
      runId,
      attempt,
      sessionKey: spawnResult.sessionKey,
      verifyTimeoutMs: opts.verifyTimeoutMs,
    });

    if (attempt < totalAttempts) {
      const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      info(`Retrying in ${backoff}ms...`, opts);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  // ── ALL RETRIES EXHAUSTED ──
  const result = {
    ok: false,
    runId,
    agent: opts.agent,
    exitReason: "all_retries_exhausted",
    attempts: totalAttempts,
    lastSessionKey: lastSpawnResult?.sessionKey || null,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  log({ ts: new Date().toISOString(), event: "spawn_exhausted", runId, ...result });

  if (opts.json) {
    console.log(JSON.stringify(result));
  } else {
    console.error(`SPAWN_FAILED: all ${totalAttempts} attempts exhausted for ${opts.agent}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(`[spawn-health-check] Fatal: ${err.stack || err}`);
  process.exit(3);
});
