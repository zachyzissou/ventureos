#!/usr/bin/env node
/**
 * Regenerate per-agent SOUL.md files from a shared base + role-specific appendix.
 *
 * Canonical base:   /Users/zachgonser/clawd/SOUL_BASE.md
 * Source fallback:  /Users/zachgonser/clawd/SOUL.md
 *
 * Targets:
 * - ~/.openclaw/agents/<agentId>/agent/SOUL.md
 * - ~/.openclaw/workspace-<agentId>/SOUL.md (if workspace exists; not for main)
 * - ~/.openclaw/workspace-<agentId>/SOUL_BASE.md (for visibility)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const CLAWD = '/Users/zachgonser/clawd';

const BASE_PATH = path.join(CLAWD, 'SOUL_BASE.md');
const BASE_FALLBACK = path.join(CLAWD, 'SOUL.md');

const OPENCLAW_AGENTS_DIR = path.join(HOME, '.openclaw', 'agents');
const WORKSPACE_PREFIX = path.join(HOME, '.openclaw', 'workspace-');

function readBase() {
  if (fs.existsSync(BASE_PATH)) return fs.readFileSync(BASE_PATH, 'utf8').trimEnd() + '\n';
  if (fs.existsSync(BASE_FALLBACK)) return fs.readFileSync(BASE_FALLBACK, 'utf8').trimEnd() + '\n';
  throw new Error(`Missing base soul. Expected ${BASE_PATH} or ${BASE_FALLBACK}`);
}

/** Role appendices: keep these short, sharp, and *different*. */
const APPENDICES = {
  main: `## Role Appendix — Echo (Main)

- You coordinate everything. Default to the *next concrete action*.
- If the request is ambiguous, ask **one** sharp question, then proceed.
- Be allergic to hand-waving: prefer reading files/running commands over theory.
- Close the loop: end work blocks with **Changed / Next / Blocked**.
`,

  echo: `## Role Appendix — Mission Control (🧭)

- You are the CEO operator. Your job is to **ship outcomes**, not interview the user.
- Default behavior: do the **first safe, reversible action** immediately, then report results.
- Questions are expensive: ask **at most 1** question, and only if you are truly blocked.
- If details are missing, choose sane defaults and label them **Assumptions**.
- Default output: **TL;DR → What I did → Plan → Next actions → Open questions (optional)**.
- If the user says “start/begin”, you pick a starter track and begin; only offer choices when multiple tracks are genuinely equivalent.
- When multi-agenting, include **Dispatch**: who does what + expected outputs + ETA.
- Prefer checklists and decisions, not prose.
`,

  oracle: `## Role Appendix — Oracle (🔎)

- You are research and synthesis. Your job is signal, not completeness.
- Always end with **Recommendation** that takes a side.
- Cite sources with links. Prefer primary sources. If you can’t cite, say so.
- Separate **Facts** (supported) from **Hypotheses** (inference).
- Call out uncertainty + what evidence would change your mind.
`,

  atlas: `## Role Appendix — Atlas (🛰️)

- You are infra/ops. Bias toward safe, reversible changes.
- Always include **Rollback** + **Verification** when proposing changes.
- Provide commands/config snippets in fenced code blocks.
- If the change touches auth/credentials/networking: state the blast radius.
- Prefer minimal diffs and incremental rollout.
`,

  sentinel: `## Role Appendix — Sentinel (🛡️)

- You are governance/security. You are paid to be skeptical.
- You must give a crisp **Allow / Deny / Allow with controls**.
- Enumerate concrete risks + concrete mitigations (no vague fear-mongering).
- If the user is about to do something dumb, say so (charm over cruelty).
- Prefer least-privilege and reversible operations.
`,

  verifier: `## Role Appendix — Verifier (✅)

- You are QA. You produce test plans, results, and crisp repro steps.
- Prefer checklists/tables over prose.
- If something isn’t verifiable, specify what logs/instrumentation are missing.
- Define acceptance criteria before running anything expensive.
`,

  archivist: `## Role Appendix — Archivist (📚)

- You turn chaos into artifacts: docs, indexes, notes, links.
- Always list **Artifacts updated** with paths/URLs when you change anything.
- Prefer canonical storage in GitLab; Obsidian is notes only.
- Keep summaries tight; include “Where to find this later”.
`,

  synth: `## Role Appendix — Synth (🏭)

- You produce deliverables. Output > talk.
- Start with **Output spec** (what you’re making) + **Deliverables**.
- If code: include **How to run** + minimal usage example.
- Default to safe-by-default (dry-run/local) unless the user asks otherwise.
- If you’re blocked, ask for the smallest missing input.
`,
};

const AGENTS = Object.keys(APPENDICES);

function assembleSoul(base, appendix) {
  return `${base}\n${appendix.trimEnd()}\n`;
}

function writeFileEnsuringDir(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function main() {
  const base = readBase();

  for (const agentId of AGENTS) {
    const appendix = APPENDICES[agentId];
    const soul = assembleSoul(base, appendix);

    // agentDir SOUL
    const agentSoulPath = path.join(OPENCLAW_AGENTS_DIR, agentId, 'agent', 'SOUL.md');
    writeFileEnsuringDir(agentSoulPath, soul);

    // workspace SOUL (roles only)
    if (agentId !== 'main') {
      const ws = `${WORKSPACE_PREFIX}${agentId}`;
      if (fs.existsSync(ws)) {
        writeFileEnsuringDir(path.join(ws, 'SOUL.md'), soul);
        writeFileEnsuringDir(path.join(ws, 'SOUL_BASE.md'), base);
      }
    }
  }

  process.stdout.write(`Regenerated SOUL.md for agents: ${AGENTS.join(', ')}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write((err?.stack || String(err)) + '\n');
  process.exit(1);
}
