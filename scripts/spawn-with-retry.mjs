#!/usr/bin/env node
/**
 * Retry wrapper for sessions_spawn with exponential backoff.
 *
 * Workspace-isolated defaults:
 * - default deny for explicit paths outside workspace
 * - minimal shared script allowlist (discord-webhook-send + critical wrappers)
 * - per-agent temp dir: /tmp/agent-<agentId>/
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const BACKOFF_SECONDS = [2, 4, 8, 16];
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_SPAWN_CMD = process.env.SESSIONS_SPAWN_CMD || "sessions_spawn";
const HOME_DIR = os.homedir();

const DEFAULT_SHARED_ALLOWLIST = [
  path.resolve(REPO_ROOT, "scripts/discord-webhook-send.mjs"),
  path.join(HOME_DIR, "clawd", "scripts", "discord-webhook-send.mjs"),
  path.join(HOME_DIR, "clawd", "projects", "openclaw-upgrade", "scripts", "retry.sh"),
  path.join(HOME_DIR, "clawd", "projects", "openclaw-upgrade", "scripts", "with-timeout.sh"),
].map((p) => path.resolve(p));

function getAgentId() {
  const raw = process.env.OPENCLAW_AGENT_ID || process.env.AGENT_ID || "main";
  return String(raw).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function getWorkspaceRoot() {
  const configured =
    process.env.OPENCLAW_WORKSPACE || process.env.AGENT_WORKSPACE || process.env.WORKSPACE_ROOT;
  return path.resolve(configured || process.cwd());
}

function getAgentTmpDir(agentId) {
  const dir = path.join("/tmp", `agent-${agentId}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function getSharedAllowlist() {
  const extra = String(process.env.SHARED_SCRIPT_ALLOWLIST || "")
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => resolvePath(p));

  return new Set([...DEFAULT_SHARED_ALLOWLIST, ...extra]);
}

function resolvePath(rawPath, baseDir = process.cwd()) {
  const raw = String(rawPath);
  if (raw.startsWith("~/")) {
    return path.resolve(os.homedir(), raw.slice(2));
  }
  if (raw === "~") {
    return path.resolve(os.homedir());
  }
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(baseDir, raw);
}

function isWithin(targetPath, basePath) {
  const rel = path.relative(basePath, targetPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const CONTEXT = {
  agentId: getAgentId(),
  workspaceRoot: getWorkspaceRoot(),
};
CONTEXT.tmpDir = getAgentTmpDir(CONTEXT.agentId);
CONTEXT.sharedAllowlist = getSharedAllowlist();

const DEFAULT_LOG_FILE =
  process.env.SPAWN_RETRY_LOG || path.join(CONTEXT.workspaceRoot, "runtime", "logs", "spawn-with-retry.log");

function deny(reason, details = "") {
  const suffix = details ? ` (${details})` : "";
  throw new Error(`PATH_ISOLATION_DENY: ${reason}${suffix}`);
}

function assertWritablePath(rawPath, label) {
  const resolved = resolvePath(rawPath);
  if (isWithin(resolved, CONTEXT.workspaceRoot) || isWithin(resolved, CONTEXT.tmpDir)) {
    return resolved;
  }
  deny(`${label} must be inside workspace or /tmp/agent-${CONTEXT.agentId}`, resolved);
}

function assertExecutablePath(rawPath, label) {
  const cmd = String(rawPath || "").trim();
  if (!cmd) {
    throw new Error(`${label} is required`);
  }

  // Bare command names (e.g., sessions_spawn) resolve via PATH.
  if (!cmd.includes("/")) {
    return cmd;
  }

  const resolved = resolvePath(cmd);
  if (isWithin(resolved, CONTEXT.workspaceRoot) || CONTEXT.sharedAllowlist.has(resolved)) {
    return resolved;
  }

  deny(`${label} outside workspace is not allowlisted`, resolved);
}

function usage(code = 0) {
  const msg = `spawn-with-retry.mjs

Usage:
  node scripts/spawn-with-retry.mjs [options] -- <sessions_spawn args...>

Options:
  --spawn-cmd <cmd>      Command to execute (default: sessions_spawn)
  --max-retries <n>      Retries after initial attempt (default: 3)
  --log-file <path>      Failure log path (workspace-local by default)
  --quiet                Do not stream child stdout/stderr
  --json                 Print machine-readable final result JSON
  -h, --help             Show help

Isolation:
  - Agent ID: ${CONTEXT.agentId}
  - Workspace: ${CONTEXT.workspaceRoot}
  - TMPDIR: ${CONTEXT.tmpDir}
  - Default deny outside workspace for explicit path args

Examples:
  AGENT_ID=atlas OPENCLAW_WORKSPACE=~/.openclaw/workspace-atlas \
    node scripts/spawn-with-retry.mjs -- task:"Build QA report" label:"qa"

  AGENT_ID=oracle OPENCLAW_WORKSPACE=~/.openclaw/workspace-oracle \
    node scripts/spawn-with-retry.mjs --max-retries 4 -- task:"Dispatch" label:"dispatch-1"

  AGENT_ID=atlas OPENCLAW_WORKSPACE=~/.openclaw/workspace-atlas \
    node scripts/spawn-with-retry.mjs --spawn-cmd /tmp/agent-atlas/mock-spawn.sh -- --agent invalid-agent
`;
  process.stdout.write(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    spawnCmd: DEFAULT_SPAWN_CMD,
    maxRetries: DEFAULT_MAX_RETRIES,
    logFile: DEFAULT_LOG_FILE,
    quiet: false,
    json: false,
  };

  const passthrough = [];
  let afterDoubleDash = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];

    if (afterDoubleDash) {
      passthrough.push(a);
      continue;
    }

    if (a === "--") {
      afterDoubleDash = true;
      continue;
    }

    if (a === "-h" || a === "--help") usage(0);
    if (a === "--quiet") {
      opts.quiet = true;
      continue;
    }
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--spawn-cmd") {
      opts.spawnCmd = argv[++i];
      continue;
    }
    if (a === "--max-retries") {
      const v = Number.parseInt(argv[++i], 10);
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(`Invalid --max-retries value: ${argv[i]}`);
      }
      opts.maxRetries = v;
      continue;
    }
    if (a === "--log-file") {
      opts.logFile = argv[++i];
      continue;
    }

    // Unknown flags and positional args are forwarded to sessions_spawn.
    passthrough.push(a);
  }

  opts.spawnCmd = assertExecutablePath(opts.spawnCmd, "spawn-cmd");
  opts.logFile = assertWritablePath(opts.logFile, "log-file");

  return { opts, passthrough };
}

function shellEscape(s) {
  const str = String(s);
  if (str.length === 0) return "''";
  return `'${str.replace(/'/g, `'"'"'`)}'`;
}

function appendLog(logFile, record) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, JSON.stringify(record) + "\n", "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Session file count pre-check (GitHub #34 prevention) ---
const SESSION_COUNT_WARN = 200;
const SESSION_COUNT_FAIL = 500;

function getSessionFileCount(agentId) {
  const sessionsDir = path.join(
    os.homedir(),
    ".openclaw",
    "agents",
    agentId,
    "sessions"
  );

  try {
    if (!fs.existsSync(sessionsDir)) return 0;
    const entries = fs.readdirSync(sessionsDir);
    // Count all files (jsonl + deleted) since both contribute to scan overhead
    return entries.length;
  } catch {
    return -1; // unknown, don't block
  }
}

function checkSessionCountBeforeSpawn(agentId, logFile) {
  const count = getSessionFileCount(agentId);
  const record = {
    ts: new Date().toISOString(),
    event: "session_count_check",
    agentId,
    sessionFileCount: count,
  };

  if (count < 0) {
    record.status = "unknown";
    appendLog(logFile, record);
    process.stderr.write(
      `[spawn-with-retry] ⚠️  Could not read session count for agent ${agentId}\n`
    );
    return true; // don't block on error
  }

  if (count >= SESSION_COUNT_FAIL) {
    record.status = "critical";
    record.threshold = SESSION_COUNT_FAIL;
    appendLog(logFile, record);
    process.stderr.write(
      `[spawn-with-retry] 🚨 CRITICAL: Agent ${agentId} has ${count} session files (limit: ${SESSION_COUNT_FAIL}).\n` +
      `  Spawn blocked to prevent phantom session. Run rotate-agent-sessions.sh first.\n`
    );
    return false; // block spawn
  }

  if (count >= SESSION_COUNT_WARN) {
    record.status = "warning";
    record.threshold = SESSION_COUNT_WARN;
    appendLog(logFile, record);
    process.stderr.write(
      `[spawn-with-retry] ⚠️  WARNING: Agent ${agentId} has ${count} session files (warn: ${SESSION_COUNT_WARN}). Consider rotating.\n`
    );
  } else {
    record.status = "ok";
  }

  appendLog(logFile, record);
  return true; // allow spawn
}

function runCommand(commandLine, { quiet }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn("bash", ["-lc", commandLine], {
      env: {
        ...process.env,
        OPENCLAW_AGENT_ID: CONTEXT.agentId,
        OPENCLAW_WORKSPACE: CONTEXT.workspaceRoot,
        TMPDIR: CONTEXT.tmpDir,
      },
      cwd: CONTEXT.workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (!quiet) process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (!quiet) process.stderr.write(text);
    });

    child.on("close", (code, signal) => {
      resolve({
        code: typeof code === "number" ? code : 1,
        signal: signal || null,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function main() {
  const { opts, passthrough } = parseArgs(process.argv);

  if (!opts.spawnCmd || !String(opts.spawnCmd).trim()) {
    throw new Error("Missing spawn command. Use --spawn-cmd or SESSIONS_SPAWN_CMD.");
  }

  // Pre-spawn session count check (GitHub #34 — phantom session prevention)
  const sessionCountOk = checkSessionCountBeforeSpawn(CONTEXT.agentId, opts.logFile);
  if (!sessionCountOk) {
    const summary = {
      ok: false,
      agentId: CONTEXT.agentId,
      workspace: CONTEXT.workspaceRoot,
      reason: "session_file_count_exceeded",
      sessionFileCount: getSessionFileCount(CONTEXT.agentId),
      threshold: SESSION_COUNT_FAIL,
      command: opts.spawnCmd,
      args: passthrough,
      logFile: opts.logFile,
    };
    if (opts.json) {
      process.stdout.write(JSON.stringify(summary) + "\n");
    }
    process.exit(1);
  }

  const cmd = [opts.spawnCmd, ...passthrough].map(shellEscape).join(" ");
  const totalAttempts = opts.maxRetries + 1;

  let lastResult = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const attemptStartedAt = new Date().toISOString();
    const result = await runCommand(cmd, { quiet: opts.quiet });
    lastResult = result;

    if (result.code === 0) {
      const summary = {
        ok: true,
        agentId: CONTEXT.agentId,
        workspace: CONTEXT.workspaceRoot,
        tmpDir: CONTEXT.tmpDir,
        command: opts.spawnCmd,
        args: passthrough,
        attempt,
        retriesUsed: attempt - 1,
        maxRetries: opts.maxRetries,
        sessionFileCount: getSessionFileCount(CONTEXT.agentId),
        logFile: opts.logFile,
      };

      appendLog(opts.logFile, {
        ts: new Date().toISOString(),
        event: "spawn_success",
        ...summary,
        durationMs: result.durationMs,
      });

      if (opts.json) {
        process.stdout.write(JSON.stringify(summary) + "\n");
      } else {
        process.stdout.write(`SPAWN_SUCCESS attempt=${attempt} retries_used=${attempt - 1}\n`);
      }
      process.exit(0);
    }

    const retryNumber = attempt; // first failure corresponds to retry #1
    const willRetry = retryNumber <= opts.maxRetries;
    const backoffSeconds = BACKOFF_SECONDS[Math.min(retryNumber - 1, BACKOFF_SECONDS.length - 1)];

    const failureRecord = {
      ts: new Date().toISOString(),
      event: willRetry ? "spawn_retry" : "spawn_failed",
      agentId: CONTEXT.agentId,
      workspace: CONTEXT.workspaceRoot,
      attempt,
      totalAttempts,
      maxRetries: opts.maxRetries,
      retryNumber,
      willRetry,
      nextBackoffSeconds: willRetry ? backoffSeconds : 0,
      command: opts.spawnCmd,
      args: passthrough,
      exitCode: result.code,
      signal: result.signal,
      durationMs: result.durationMs,
      attemptStartedAt,
      stdout: result.stdout,
      stderr: result.stderr,
    };

    appendLog(opts.logFile, failureRecord);

    if (!willRetry) {
      const summary = {
        ok: false,
        agentId: CONTEXT.agentId,
        workspace: CONTEXT.workspaceRoot,
        command: opts.spawnCmd,
        args: passthrough,
        attempts: attempt,
        retriesUsed: attempt - 1,
        maxRetries: opts.maxRetries,
        exitCode: result.code,
        logFile: opts.logFile,
      };

      if (opts.json) {
        process.stdout.write(JSON.stringify(summary) + "\n");
      } else {
        process.stderr.write(`SPAWN_FAILURE attempts=${attempt} exit_code=${result.code}\n`);
      }
      process.exit(result.code || 1);
    }

    process.stderr.write(
      `[spawn-with-retry] attempt ${attempt}/${totalAttempts} failed (exit ${result.code}); retrying in ${backoffSeconds}s\n`,
    );
    await sleep(backoffSeconds * 1000);
  }

  const fallbackCode = lastResult?.code || 1;
  process.exit(fallbackCode);
}

main().catch((err) => {
  process.stderr.write(`[spawn-with-retry] ${err?.stack || String(err)}\n`);
  process.exit(1);
});
