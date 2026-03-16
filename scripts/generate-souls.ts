import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateSoulMd, validateCard, type AgentRoleCard } from "../role-cards/schema";

import { nexus } from "../role-cards/02-nexus";
import { oracle } from "../role-cards/03-oracle";
import { atlas } from "../role-cards/04-atlas";
import { sentinel } from "../role-cards/05-sentinel";
import { verifier } from "../role-cards/06-verifier";
import { archivist } from "../role-cards/07-archivist";
import { synth } from "../role-cards/08-synth";

type Options = {
  outDir: string;
  agentIds: Set<string>;
  deployWorkspaces: boolean;
  openclawHome: string;
  backupWorkspaceFiles: boolean;
};

const REPO_ROOT = path.resolve(__dirname, "..");

function usage(code = 0): never {
  // eslint-disable-next-line no-console
  console.log(`generate-souls.ts

Usage:
  node -r ts-node/register scripts/generate-souls.ts [--out-dir <dir>] [--agents <csv>] [--deploy-workspaces]

Options:
  --out-dir <dir>          Output directory inside repo (default: souls)
  --agents <csv>           Comma-separated agent ids (default: nexus,oracle,atlas,sentinel,verifier,archivist,synth)
  --deploy-workspaces      Also write to ~/.openclaw/workspace-<agentId>/SOUL.md when present
  --openclaw-home <dir>    Override OpenClaw home (default: ~/.openclaw)
  --no-workspace-backup    Do not create timestamped backups in workspaces
  -h, --help               Show help
`);
  process.exit(code);
}

function parseArgs(argv: string[]): Options {
  const defaultAgents = [
    "nexus",
    "oracle",
    "atlas",
    "sentinel",
    "verifier",
    "archivist",
    "synth",
  ];

  const opts: Options = {
    outDir: path.join(REPO_ROOT, "souls"),
    agentIds: new Set(defaultAgents),
    deployWorkspaces: false,
    openclawHome: path.join(os.homedir(), ".openclaw"),
    backupWorkspaceFiles: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];

    if (a === "-h" || a === "--help") usage(0);

    if (a === "--out-dir") {
      const v = argv[++i];
      if (!v) throw new Error("--out-dir requires a value");
      opts.outDir = path.isAbsolute(v) ? v : path.resolve(REPO_ROOT, v);
      continue;
    }

    if (a === "--agents") {
      const v = argv[++i];
      if (v == null) throw new Error("--agents requires a value");

      const agentIds = new Set(
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );

      if (agentIds.size === 0) {
        throw new Error("--agents must include at least one agent id");
      }

      opts.agentIds = agentIds;
      continue;
    }

    if (a === "--deploy-workspaces") {
      opts.deployWorkspaces = true;
      continue;
    }

    if (a === "--openclaw-home") {
      const v = argv[++i];
      if (!v) throw new Error("--openclaw-home requires a value");
      opts.openclawHome = path.isAbsolute(v) ? v : path.resolve(REPO_ROOT, v);
      continue;
    }

    if (a === "--no-workspace-backup") {
      opts.backupWorkspaceFiles = false;
      continue;
    }

    throw new Error(`Unknown arg: ${a}`);
  }

  return opts;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function writeFileEnsured(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function maybeBackup(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const bak = `${filePath}.bak-${timestamp()}`;
  fs.copyFileSync(filePath, bak);
}

const CARD_BY_ID: Record<string, AgentRoleCard> = {
  nexus,
  oracle,
  atlas,
  sentinel,
  verifier,
  archivist,
  synth,
};

function main(): void {
  const opts = parseArgs(process.argv);

  const unknown = [...opts.agentIds].filter((id) => !(id in CARD_BY_ID));
  if (unknown.length) {
    throw new Error(`Unknown agent ids: ${unknown.join(", ")}`);
  }

  const selectedCards = [...opts.agentIds]
    .sort()
    .map((id) => validateCard(CARD_BY_ID[id]!));

  for (const card of selectedCards) {
    const soul = generateSoulMd(card) + "\n";

    const repoOut = path.join(opts.outDir, card.id, "SOUL.md");
    writeFileEnsured(repoOut, soul);

    if (opts.deployWorkspaces) {
      const ws = path.join(opts.openclawHome, `workspace-${card.id}`);
      const wsSoul = path.join(ws, "SOUL.md");
      if (fs.existsSync(ws)) {
        if (opts.backupWorkspaceFiles) maybeBackup(wsSoul);
        writeFileEnsured(wsSoul, soul);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Generated ${selectedCards.length} SOUL.md files into ${path.relative(REPO_ROOT, opts.outDir)}` +
      (opts.deployWorkspaces ? ` and deployed to ${opts.openclawHome}/workspace-*/SOUL.md` : "")
  );
}

main();
