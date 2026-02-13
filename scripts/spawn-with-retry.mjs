#!/usr/bin/env node
/**
 * Retry wrapper for sessions_spawn with exponential backoff.
 *
 * Default behavior:
 * - command: sessions_spawn
 * - retries: 3 (4 total attempts)
 * - backoff: 2s, 4s, 8s (16s available if max-retries >= 4)
 * - failure log: /Users/zachgonser/clawd/runtime/logs/spawn-with-retry.log
 *
 * Usage:
 *   node scripts/spawn-with-retry.mjs -- task:"Do X" model:"openai-codex/gpt-5.3-codex" label:"x"
 *   node scripts/spawn-with-retry.mjs --max-retries 4 -- task:"Do X" label:"x"
 *   node scripts/spawn-with-retry.mjs --spawn-cmd "node /tmp/mock-sessions-spawn.mjs" -- --agent invalid
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const BACKOFF_SECONDS = [2, 4, 8, 16];
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_LOG_FILE =
  process.env.SPAWN_RETRY_LOG || "/Users/zachgonser/clawd/runtime/logs/spawn-with-retry.log";
const DEFAULT_SPAWN_CMD = process.env.SESSIONS_SPAWN_CMD || "sessions_spawn";

function usage(code = 0) {
  const msg = `spawn-with-retry.mjs

Usage:
  node scripts/spawn-with-retry.mjs [options] -- <sessions_spawn args...>

Options:
  --spawn-cmd <cmd>      Command to execute (default: sessions_spawn)
  --max-retries <n>      Retries after initial attempt (default: 3)
  --log-file <path>      Failure log path
  --quiet                Do not stream child stdout/stderr
  --json                 Print machine-readable final result JSON
  -h, --help             Show help

Examples:
  node scripts/spawn-with-retry.mjs -- task:"Build QA report" model:"openai-codex/gpt-5.3-codex" label:"qa"
  node scripts/spawn-with-retry.mjs --max-retries 4 -- task:"Dispatch" label:"dispatch-1"
  node scripts/spawn-with-retry.mjs --spawn-cmd "node /tmp/mock-spawn.mjs" -- --agent invalid-agent
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

function runCommand(commandLine, { quiet }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn("bash", ["-lc", commandLine], {
      env: process.env,
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
        command: opts.spawnCmd,
        args: passthrough,
        attempt,
        retriesUsed: attempt - 1,
        maxRetries: opts.maxRetries,
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
