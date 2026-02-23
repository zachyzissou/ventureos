#!/usr/bin/env node
/**
 * spawn-with-verification.mjs
 *
 * Antfarm-inspired workflow wrapper for sessions_spawn:
 * - Fresh context per step (context file generated for each spawn)
 * - Explicit verification step with retry loop (dev ↔ verifier)
 * - Spawn retry logic with exponential backoff for transient failures
 *
 * This script is intentionally small and dependency-free.
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

const DEFAULT_BACKOFF_SECONDS = [2, 4, 8, 16];
const DEFAULT_MAX_SPAWN_RETRIES = 3;
const DEFAULT_MAX_VERIFY_CYCLES = 2;
const DEFAULT_SPAWN_CMD = process.env.SESSIONS_SPAWN_CMD || "sessions_spawn";
const HOME_DIR = os.homedir();

const DEFAULT_SHARED_ALLOWLIST = [
  path.resolve(REPO_ROOT, "scripts/spawn-with-retry.mjs"),
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

function resolvePath(rawPath, baseDir = process.cwd()) {
  const raw = String(rawPath);
  if (raw.startsWith("~/")) return path.resolve(os.homedir(), raw.slice(2));
  if (raw === "~") return path.resolve(os.homedir());
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
CONTEXT.sharedAllowlist = new Set([
  ...DEFAULT_SHARED_ALLOWLIST,
  ...String(process.env.SHARED_SCRIPT_ALLOWLIST || "")
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => resolvePath(p)),
]);

function deny(reason, details = "") {
  const suffix = details ? ` (${details})` : "";
  throw new Error(`PATH_ISOLATION_DENY: ${reason}${suffix}`);
}

function assertWritablePath(rawPath, label) {
  const resolved = resolvePath(rawPath);
  if (isWithin(resolved, CONTEXT.workspaceRoot) || isWithin(resolved, CONTEXT.tmpDir)) return resolved;
  deny(`${label} must be inside workspace or /tmp/agent-${CONTEXT.agentId}`, resolved);
}

function assertReadablePath(rawPath, label) {
  const resolved = resolvePath(rawPath);
  if (isWithin(resolved, CONTEXT.workspaceRoot) || isWithin(resolved, CONTEXT.tmpDir)) return resolved;
  deny(`${label} must be inside workspace or /tmp/agent-${CONTEXT.agentId}`, resolved);
}

function assertExecutablePath(rawPath, label) {
  const cmd = String(rawPath || "").trim();
  if (!cmd) throw new Error(`${label} is required`);
  if (!cmd.includes("/")) return cmd; // bare command resolves via PATH

  const resolved = resolvePath(cmd);
  if (isWithin(resolved, CONTEXT.workspaceRoot) || CONTEXT.sharedAllowlist.has(resolved)) return resolved;
  deny(`${label} outside workspace is not allowlisted`, resolved);
}

function shellEscape(s) {
  const str = String(s);
  if (str.length === 0) return "''";
  return `'${str.replace(/'/g, `"'"'"'`)}'`;
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage(code = 0) {
  process.stdout.write(`spawn-with-verification.mjs

Usage:
  node scripts/spawn-with-verification.mjs [options]

Required:
  --task <text>              Original request / feature / bugfix

Options:
  --spawn-cmd <cmd>          Spawn command to execute (default: sessions_spawn)
  --run-dir <path>           Output directory (default: <workspace>/runtime/runs/spawn-verified/<runId>)
  --log-file <path>          JSONL log path (default: <workspace>/runtime/logs/spawn-with-verification.jsonl)
  --plan-target <t>          (default: agent:planner)
  --dev-target <t>           (default: agent:dev)
  --verify-target <t>        (default: agent:verifier)
  --skip-plan                Start with dev (no planning step)
  --max-verify-cycles <n>    Max dev↔verify cycles (default: ${DEFAULT_MAX_VERIFY_CYCLES})
  --max-spawn-retries <n>    Retries per spawn call (default: ${DEFAULT_MAX_SPAWN_RETRIES})
  --backoff-seconds <csv>    Override backoff schedule (default: ${DEFAULT_BACKOFF_SECONDS.join(",")})
  --common-arg <arg>         Extra arg forwarded to all spawn calls (repeatable)
  --plan-arg <arg>           Extra arg forwarded to plan spawn (repeatable)
  --dev-arg <arg>            Extra arg forwarded to dev spawn (repeatable)
  --verify-arg <arg>         Extra arg forwarded to verify spawn (repeatable)
  --quiet                    Do not stream child stdout/stderr
  --json                     Print final machine-readable JSON summary
  -h, --help                 Show help

Notes:
  - Context files are generated fresh per step and passed via --context.
  - Verifier output must include either 'STATUS: approved' or 'STATUS: retry'.
  - Output artifacts are written into --run-dir.

Isolation:
  - Agent ID: ${CONTEXT.agentId}
  - Workspace: ${CONTEXT.workspaceRoot}
  - TMPDIR: ${CONTEXT.tmpDir}
`);
  process.exit(code);
}

function parseCsvNumbers(raw, label) {
  const parts = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`Invalid ${label}: empty`);
  const vals = parts.map((p) => {
    const n = Number.parseFloat(p);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${label} value: ${p}`);
    return n;
  });
  return vals;
}

function parseArgs(argv) {
  const opts = {
    task: "",
    spawnCmd: DEFAULT_SPAWN_CMD,
    runDir: "",
    logFile: path.join(CONTEXT.workspaceRoot, "runtime", "logs", "spawn-with-verification.jsonl"),
    planTarget: "agent:planner",
    devTarget: "agent:dev",
    verifyTarget: "agent:verifier",
    skipPlan: false,
    maxVerifyCycles: DEFAULT_MAX_VERIFY_CYCLES,
    maxSpawnRetries: DEFAULT_MAX_SPAWN_RETRIES,
    backoffSeconds: DEFAULT_BACKOFF_SECONDS,
    quiet: false,
    json: false,
    commonArgs: [],
    planArgs: [],
    devArgs: [],
    verifyArgs: [],
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage(0);
    if (a === "--task") {
      opts.task = argv[++i] || "";
      continue;
    }
    if (a === "--spawn-cmd") {
      opts.spawnCmd = argv[++i];
      continue;
    }
    if (a === "--run-dir") {
      opts.runDir = argv[++i];
      continue;
    }
    if (a === "--log-file") {
      opts.logFile = argv[++i];
      continue;
    }
    if (a === "--plan-target") {
      opts.planTarget = argv[++i];
      continue;
    }
    if (a === "--dev-target") {
      opts.devTarget = argv[++i];
      continue;
    }
    if (a === "--verify-target") {
      opts.verifyTarget = argv[++i];
      continue;
    }
    if (a === "--skip-plan") {
      opts.skipPlan = true;
      continue;
    }
    if (a === "--max-verify-cycles") {
      const v = Number.parseInt(argv[++i], 10);
      if (!Number.isFinite(v) || v < 1) throw new Error(`Invalid --max-verify-cycles value: ${argv[i]}`);
      opts.maxVerifyCycles = v;
      continue;
    }
    if (a === "--max-spawn-retries") {
      const v = Number.parseInt(argv[++i], 10);
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --max-spawn-retries value: ${argv[i]}`);
      opts.maxSpawnRetries = v;
      continue;
    }
    if (a === "--backoff-seconds") {
      opts.backoffSeconds = parseCsvNumbers(argv[++i], "--backoff-seconds");
      continue;
    }
    if (a === "--quiet") {
      opts.quiet = true;
      continue;
    }
    if (a === "--json") {
      opts.json = true;
      continue;
    }

    if (a === "--common-arg") {
      opts.commonArgs.push(argv[++i]);
      continue;
    }
    if (a === "--plan-arg") {
      opts.planArgs.push(argv[++i]);
      continue;
    }
    if (a === "--dev-arg") {
      opts.devArgs.push(argv[++i]);
      continue;
    }
    if (a === "--verify-arg") {
      opts.verifyArgs.push(argv[++i]);
      continue;
    }

    throw new Error(`Unknown arg: ${a}`);
  }

  if (!opts.task.trim()) throw new Error("--task is required");

  opts.spawnCmd = assertExecutablePath(opts.spawnCmd, "spawn-cmd");
  opts.logFile = assertWritablePath(opts.logFile, "log-file");

  if (opts.runDir) {
    opts.runDir = assertWritablePath(opts.runDir, "run-dir");
  }

  return opts;
}

function nowRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `run-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
}

function normalizeStatus(text) {
  const s = String(text || "");
  if (/STATUS:\s*approved/i.test(s)) return "approved";
  if (/STATUS:\s*retry/i.test(s)) return "retry";
  return "unknown";
}

function extractIssues(text) {
  const s = String(text || "");
  const m = s.match(/\bISSUES\s*:\s*([\s\S]*)$/im);
  if (!m) return "";
  return String(m[1] || "").trim();
}

function buildContextMarkdown({ task, stepName, previousOutputs = [], issues = "" }) {
  const sections = [];
  sections.push(`# Task Context — ${stepName}`);
  sections.push("");
  sections.push("## Original Request");
  sections.push(task.trim());

  if (previousOutputs.length) {
    sections.push("");
    sections.push("## Previous Outputs");
    for (const out of previousOutputs) {
      sections.push("");
      sections.push(`### ${out.title}`);
      sections.push("```\n" + (out.content || "").trim() + "\n```");
    }
  }

  if (issues) {
    sections.push("");
    sections.push("## Verification Issues");
    sections.push(issues.trim());
  }

  sections.push("");
  sections.push("## Workspace");
  sections.push(`- agentId: ${CONTEXT.agentId}`);
  sections.push(`- workspace: ${CONTEXT.workspaceRoot}`);

  return sections.join("\n") + "\n";
}

function runCommand(commandLine, { quiet, cwd }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn("bash", ["-lc", commandLine], {
      env: {
        ...process.env,
        OPENCLAW_AGENT_ID: CONTEXT.agentId,
        OPENCLAW_WORKSPACE: CONTEXT.workspaceRoot,
        TMPDIR: CONTEXT.tmpDir,
      },
      cwd,
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

async function spawnWithRetry({
  spawnCmd,
  args,
  step,
  maxRetries,
  backoffSeconds,
  logFile,
  quiet,
}) {
  const totalAttempts = maxRetries + 1;
  const cmdLine = [spawnCmd, ...args].map(shellEscape).join(" ");

  let last = null;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    appendJsonl(logFile, {
      ts: new Date().toISOString(),
      event: "spawn_attempt",
      step,
      attempt,
      totalAttempts,
      command: spawnCmd,
      args,
    });

    const result = await runCommand(cmdLine, { quiet, cwd: CONTEXT.workspaceRoot });
    last = result;

    if (result.code === 0) {
      appendJsonl(logFile, {
        ts: new Date().toISOString(),
        event: "spawn_ok",
        step,
        attempt,
        durationMs: result.durationMs,
      });
      return { ...result, attempt, retriesUsed: attempt - 1 };
    }

    const retryNumber = attempt;
    const willRetry = retryNumber <= maxRetries;
    const delaySeconds = backoffSeconds[Math.min(retryNumber - 1, backoffSeconds.length - 1)] || 0;

    appendJsonl(logFile, {
      ts: new Date().toISOString(),
      event: willRetry ? "spawn_retry" : "spawn_fail",
      step,
      attempt,
      totalAttempts,
      willRetry,
      nextBackoffSeconds: willRetry ? delaySeconds : 0,
      exitCode: result.code,
      durationMs: result.durationMs,
      stderr: result.stderr,
    });

    if (!willRetry) {
      return { ...result, attempt, retriesUsed: attempt - 1 };
    }

    if (!quiet) {
      process.stderr.write(
        `[spawn-with-verification] step=${step} attempt ${attempt}/${totalAttempts} failed (exit ${result.code}); retrying in ${delaySeconds}s\n`,
      );
    }
    await sleep(delaySeconds * 1000);
  }

  return { ...(last || { code: 1, stdout: "", stderr: "" }), attempt: totalAttempts, retriesUsed: maxRetries };
}

async function writeFileChecked(filePath, content, label) {
  const p = assertWritablePath(filePath, label);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return p;
}

async function main() {
  const opts = parseArgs(process.argv);
  const runId = nowRunId();

  const runDir = opts.runDir
    ? opts.runDir
    : assertWritablePath(
        path.join(CONTEXT.workspaceRoot, "runtime", "runs", "spawn-verified", runId),
        "run-dir",
      );

  fs.mkdirSync(runDir, { recursive: true });

  appendJsonl(opts.logFile, {
    ts: new Date().toISOString(),
    event: "workflow_start",
    runId,
    agentId: CONTEXT.agentId,
    workspace: CONTEXT.workspaceRoot,
    runDir,
    spawnCmd: opts.spawnCmd,
    maxVerifyCycles: opts.maxVerifyCycles,
    maxSpawnRetries: opts.maxSpawnRetries,
  });

  const outputs = {
    plan: null,
    dev: [],
    verify: [],
  };

  if (!opts.skipPlan) {
    const planPrompt = `Plan implementation for: ${opts.task}\n\nOutput:\n- TASKS: list of implementation tasks\n- TESTS: list of tests needed\n- FILES: files that will change\n`;
    const planContext = buildContextMarkdown({ task: opts.task, stepName: "plan" });

    const planCtxPath = await writeFileChecked(path.join(runDir, "context", "plan.md"), planContext, "plan-context");
    const planOutPath = assertWritablePath(path.join(runDir, "output", "plan.md"), "plan-output");

    const args = [
      opts.planTarget,
      "--label",
      `${runId}-plan`,
      "--context",
      planCtxPath,
      "--prompt",
      planPrompt,
      ...opts.commonArgs,
      ...opts.planArgs,
    ];

    const result = await spawnWithRetry({
      spawnCmd: opts.spawnCmd,
      args,
      step: "plan",
      maxRetries: opts.maxSpawnRetries,
      backoffSeconds: opts.backoffSeconds,
      logFile: opts.logFile,
      quiet: opts.quiet,
    });

    fs.mkdirSync(path.dirname(planOutPath), { recursive: true });
    fs.writeFileSync(planOutPath, result.stdout, "utf8");

    if (result.code !== 0) {
      appendJsonl(opts.logFile, {
        ts: new Date().toISOString(),
        event: "workflow_failed",
        runId,
        reason: "plan_failed",
        exitCode: result.code,
      });
      process.exit(result.code || 1);
    }

    outputs.plan = { path: planOutPath, content: result.stdout };
  }

  for (let cycle = 1; cycle <= opts.maxVerifyCycles; cycle++) {
    const prev = [];
    if (outputs.plan) prev.push({ title: "Plan", content: outputs.plan.content });
    if (outputs.dev.length) prev.push({ title: `Dev (previous)`, content: outputs.dev[outputs.dev.length - 1].content });

    const issues = outputs.verify.length ? extractIssues(outputs.verify[outputs.verify.length - 1].content) : "";

    const devPrompt = `Implement the feature based on the plan.\n\nWhen done, reply with:\nSTATUS: done\nCHANGES: what was implemented\nTESTS: what tests were added\n`;

    const devContext = buildContextMarkdown({ task: opts.task, stepName: `dev cycle ${cycle}`, previousOutputs: prev, issues });

    const devCtxPath = await writeFileChecked(
      path.join(runDir, "context", `dev-cycle-${cycle}.md`),
      devContext,
      `dev-context-${cycle}`,
    );
    const devOutPath = assertWritablePath(path.join(runDir, "output", `dev-cycle-${cycle}.md`), `dev-output-${cycle}`);

    const devArgs = [
      opts.devTarget,
      "--label",
      `${runId}-dev-${cycle}`,
      "--context",
      devCtxPath,
      "--prompt",
      devPrompt,
      ...opts.commonArgs,
      ...opts.devArgs,
    ];

    const devResult = await spawnWithRetry({
      spawnCmd: opts.spawnCmd,
      args: devArgs,
      step: `dev:${cycle}`,
      maxRetries: opts.maxSpawnRetries,
      backoffSeconds: opts.backoffSeconds,
      logFile: opts.logFile,
      quiet: opts.quiet,
    });

    fs.mkdirSync(path.dirname(devOutPath), { recursive: true });
    fs.writeFileSync(devOutPath, devResult.stdout, "utf8");

    if (devResult.code !== 0) {
      appendJsonl(opts.logFile, {
        ts: new Date().toISOString(),
        event: "workflow_failed",
        runId,
        reason: "dev_failed",
        cycle,
        exitCode: devResult.code,
      });
      process.exit(devResult.code || 1);
    }

    outputs.dev.push({ path: devOutPath, content: devResult.stdout });

    const verifyPrompt = `Verify the implementation:\n\n1. Run all tests - do they pass?\n2. Review code quality\n3. Check test coverage\n4. Confirm requirements met\n\nReply with:\nSTATUS: approved OR STATUS: retry\nVERIFIED: what was confirmed\nISSUES: any problems found (if retry)\n`;

    const verifyContext = buildContextMarkdown({
      task: opts.task,
      stepName: `verify cycle ${cycle}`,
      previousOutputs: [{ title: `Dev cycle ${cycle}`, content: devResult.stdout }, ...(outputs.plan ? [{ title: "Plan", content: outputs.plan.content }] : [])],
    });

    const verifyCtxPath = await writeFileChecked(
      path.join(runDir, "context", `verify-cycle-${cycle}.md`),
      verifyContext,
      `verify-context-${cycle}`,
    );
    const verifyOutPath = assertWritablePath(
      path.join(runDir, "output", `verify-cycle-${cycle}.md`),
      `verify-output-${cycle}`,
    );

    const verifyArgs = [
      opts.verifyTarget,
      "--label",
      `${runId}-verify-${cycle}`,
      "--context",
      verifyCtxPath,
      "--prompt",
      verifyPrompt,
      ...opts.commonArgs,
      ...opts.verifyArgs,
    ];

    const verifyResult = await spawnWithRetry({
      spawnCmd: opts.spawnCmd,
      args: verifyArgs,
      step: `verify:${cycle}`,
      maxRetries: opts.maxSpawnRetries,
      backoffSeconds: opts.backoffSeconds,
      logFile: opts.logFile,
      quiet: opts.quiet,
    });

    fs.mkdirSync(path.dirname(verifyOutPath), { recursive: true });
    fs.writeFileSync(verifyOutPath, verifyResult.stdout, "utf8");

    if (verifyResult.code !== 0) {
      appendJsonl(opts.logFile, {
        ts: new Date().toISOString(),
        event: "workflow_failed",
        runId,
        reason: "verify_failed",
        cycle,
        exitCode: verifyResult.code,
      });
      process.exit(verifyResult.code || 1);
    }

    outputs.verify.push({ path: verifyOutPath, content: verifyResult.stdout });

    const status = normalizeStatus(verifyResult.stdout);
    appendJsonl(opts.logFile, {
      ts: new Date().toISOString(),
      event: "verify_status",
      runId,
      cycle,
      status,
    });

    if (status === "approved") {
      const summary = {
        ok: true,
        runId,
        cyclesUsed: cycle,
        runDir,
        logFile: opts.logFile,
      };
      appendJsonl(opts.logFile, {
        ts: new Date().toISOString(),
        event: "workflow_success",
        ...summary,
      });

      if (opts.json) process.stdout.write(JSON.stringify(summary) + "\n");
      else process.stdout.write(`WORKFLOW_SUCCESS run_id=${runId} cycles_used=${cycle} run_dir=${runDir}\n`);
      process.exit(0);
    }

    if (status !== "retry") {
      appendJsonl(opts.logFile, {
        ts: new Date().toISOString(),
        event: "workflow_failed",
        runId,
        reason: "verifier_unknown_status",
        cycle,
      });
      process.stderr.write(
        `[spawn-with-verification] verifier output missing STATUS marker; treating as failure. See: ${verifyOutPath}\n`,
      );
      process.exit(2);
    }

    appendJsonl(opts.logFile, {
      ts: new Date().toISOString(),
      event: "verify_retry",
      runId,
      cycle,
    });
  }

  const summary = {
    ok: false,
    runId,
    cyclesUsed: opts.maxVerifyCycles,
    runDir,
    logFile: opts.logFile,
    reason: "verification_exhausted",
  };

  appendJsonl(opts.logFile, {
    ts: new Date().toISOString(),
    event: "workflow_failed",
    ...summary,
  });

  if (opts.json) process.stdout.write(JSON.stringify(summary) + "\n");
  else process.stderr.write(`WORKFLOW_FAILURE run_id=${runId} reason=verification_exhausted run_dir=${runDir}\n`);

  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`[spawn-with-verification] ${err?.stack || String(err)}\n`);
  process.exit(1);
});
