/**
 * Khaydarin Card Schema — VentureOS Agent Identity System
 *
 * Named for the Protoss Khaydarin crystals: memory lattices that store
 * identity, purpose, and psionic resonance. Each card is dual-faced:
 * The Pylon Side (capabilities) and The Void Side (constraints).
 *
 * Schema derived from VoxYZ's 6-layer role card system, extended with 4 additional layers:
 * voice directives, affinity bonds, tool access, and persistent state.
 */

// ═══════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════

export type ProtossCaste = "templar" | "judicator" | "khalai" | "nerazim";

export interface WarpChannel {
  /** Channel type: task, query, event, artifact */
  type: "task" | "query" | "event" | "artifact";
  /** Data format: text, json, markdown, code, yaml */
  format: string;
  /** Human-readable description */
  description: string;
}

export interface Metric {
  /** What we're measuring */
  name: string;
  /** How we measure it */
  measurement: string;
  /** Target value/range */
  target: string;
}

// ═══════════════════════════════════════════
// MAIN CARD INTERFACE
// ═══════════════════════════════════════════

export interface KhaydarinCard {
  // ── Identity ──────────────────────────────
  /** Unique agent identifier (lowercase, kebab-friendly) */
  id: string;
  /** Display name */
  name: string;
  /** Protoss rank/title */
  title: string;
  /** Emoji glyph for quick identification */
  glyph: string;
  /** Protoss caste: determines communication norms */
  caste: ProtossCaste;

  // ── Front Face: The Pylon Side ────────────

  /** Layer 1: Domain — what territory this agent owns */
  nexusSphere: {
    /** One-line domain statement */
    domain: string;
    /** Explicit areas of authority */
    jurisdiction: string[];
    /** "Not my job" — explicit exclusions */
    boundaries: string[];
  };

  /** Layer 2: I/O — what goes in, what comes out */
  warpChannels: {
    inputs: WarpChannel[];
    outputs: WarpChannel[];
  };

  /** Layer 3: Done — how the agent knows a task is finished */
  warpComplete: {
    /** Exit criteria */
    conditions: string[];
    /** Minimum quality standard */
    qualityGate: string;
    /** How results are packaged */
    handoffFormat: string;
  };

  // ── Back Face: The Void Side ──────────────

  /** Layer 4: Hard Bans — absolute prohibitions */
  voidInterdicts: {
    /** NEVER do these things */
    hardBans: string[];
    /** What goes wrong if bans are violated */
    failureModes: string[];
    /** Why each ban exists */
    rationale: string[];
  };

  /** Layer 5: Escalation — when to hand off */
  psionicCascade: {
    /** Who to call when stuck */
    escalateTo: string[];
    /** What triggers escalation */
    escalateTriggers: string[];
    /** Max time before auto-escalate */
    timeout: string;
    /** What to do if escalation target unavailable */
    fallback: string;
  };

  /** Layer 6: Metrics — how performance is measured */
  resonanceReadings: {
    metrics: Metric[];
    /** How to verify agent is functioning */
    healthCheck: string;
    /** Service level expectation */
    sla: string;
  };

  // ── Extensions ────────────────────────────

  /** Layer 7: Voice — personality and communication style */
  psionicSignature: {
    /** Communication style description */
    voice: string;
    /** Key personality traits */
    personality: string[];
    /** How this agent handles disagreement */
    conflictPattern: string;
    /** Optional signature phrase */
    catchphrase?: string;
  };

  /** Layer 8: Affinities — pairwise trust scores */
  khalaBonds: Record<string, number>;

  /** Layer 9: Tools — what tools/skills this agent can invoke */
  forgeAccess: string[];

  /** Layer 10: State — what persistent state this agent maintains */
  crystalMemory: {
    /** What state survives sessions */
    persists: string[];
    /** What state is session-scoped */
    volatiles: string[];
  };
}

// ═══════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════

export function validateCard(card: KhaydarinCard): KhaydarinCard {
  // Affinity bounds check
  for (const [agent, score] of Object.entries(card.khalaBonds)) {
    if (score < 0.10 || score > 0.95) {
      throw new Error(
        `${card.id}: Affinity with ${agent} is ${score}, must be 0.10-0.95`
      );
    }
  }

  // Hard bans must have matching rationale
  if (card.voidInterdicts.hardBans.length !== card.voidInterdicts.rationale.length) {
    throw new Error(
      `${card.id}: hardBans count (${card.voidInterdicts.hardBans.length}) ` +
      `!= rationale count (${card.voidInterdicts.rationale.length})`
    );
  }

  // Self-affinity check
  if (card.id in card.khalaBonds) {
    throw new Error(`${card.id}: Cannot have affinity with self`);
  }

  return card;
}

// ═══════════════════════════════════════════
// SOUL.MD GENERATOR
// ═══════════════════════════════════════════

function ensureSentencePeriod(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function stripLeadingImperativeNegation(s: string): string {
  // Avoid awkward double-negatives like "Never Do not …".
  // Examples:
  //   "Do not ignore tests!"  -> "ignore tests!"
  //   "Don't ship secrets."   -> "ship secrets."
  const m = s.match(/^(?:do\s+not|don't|dont)\b[,:]?\s*(.*)$/i);
  if (!m) return s;

  const rest = (m[1] ?? "").trim();

  // If we can't confidently extract a meaningful imperative payload, bail out.
  // (e.g., "Don't." -> would otherwise produce "Never .")
  if (!rest || !/[\p{L}\p{N}]/u.test(rest)) return s;

  return rest;
}

function formatNeverRule(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  // If the author already started the rule with "never" (any case), normalize
  // just the leading word's casing.
  if (/^never\b/i.test(trimmed)) {
    return ensureSentencePeriod(trimmed.replace(/^never\b/i, "Never"));
  }

  const normalized = stripLeadingImperativeNegation(trimmed);
  return ensureSentencePeriod(`Never ${normalized}`);
}

function formatWarpChannel(ch: WarpChannel): string {
  return `- **${ch.type}** (_${ch.format}_): ${ch.description}`;
}

function formatMetric(m: Metric): string {
  return `- **${m.name}:** ${m.measurement} (target: ${m.target})`;
}

export function generateSoulMd(card: KhaydarinCard): string {
  const sections: string[] = [];

  sections.push(`# SOUL.md — ${card.name} (${card.title})`);
  sections.push("");

  sections.push("## Identity");
  sections.push(`${card.glyph} **${card.name}** — ${card.title} of the ${card.caste} caste.`);
  sections.push(`> ${card.nexusSphere.domain}`);
  sections.push("");

  sections.push("## Jurisdiction");
  card.nexusSphere.jurisdiction.forEach((j) => sections.push(`- ${j}`));
  sections.push("");

  sections.push("## NOT My Domain");
  card.nexusSphere.boundaries.forEach((b) => sections.push(`- ${b}`));
  sections.push("");

  sections.push("## How I Work");
  sections.push("### Inputs I Accept");
  card.warpChannels.inputs.forEach((i) => sections.push(formatWarpChannel(i)));
  sections.push("");

  sections.push("### What I Produce");
  card.warpChannels.outputs.forEach((o) => sections.push(formatWarpChannel(o)));
  sections.push("");

  sections.push("### When I'm Done");
  card.warpComplete.conditions.forEach((c) => sections.push(`- ${c}`));
  sections.push("");
  sections.push(`**Quality Gate:** ${card.warpComplete.qualityGate}`);
  sections.push(`**Handoff Format:** ${card.warpComplete.handoffFormat}`);
  sections.push("");

  sections.push("## Voice");
  sections.push(card.psionicSignature.voice);
  sections.push("");

  sections.push("### Personality");
  card.psionicSignature.personality.forEach((p) => sections.push(`- ${p}`));
  sections.push("");

  sections.push("### Conflict Pattern");
  sections.push(card.psionicSignature.conflictPattern);
  if (card.psionicSignature.catchphrase) {
    sections.push("");
    sections.push(`> *"${card.psionicSignature.catchphrase}"*`);
  }
  sections.push("");

  sections.push("## NEVER (Void Interdicts — Non‑Negotiable)");
  card.voidInterdicts.hardBans
    .map(formatNeverRule)
    .filter(Boolean)
    .forEach((ban) => sections.push(`- ${ban}`));
  sections.push("");

  sections.push("## When to Escalate (Psionic Cascade)");
  sections.push(`**Escalate to:** ${card.psionicCascade.escalateTo.join(", ")}`);
  card.psionicCascade.escalateTriggers.forEach((t) => sections.push(`- ${t}`));
  sections.push("");
  sections.push(`**Timeout:** ${card.psionicCascade.timeout}`);
  sections.push(`**Fallback:** ${card.psionicCascade.fallback}`);
  sections.push("");

  sections.push("## My Standards (Resonance Readings)");
  sections.push("### Metrics");
  card.resonanceReadings.metrics.forEach((m) => sections.push(formatMetric(m)));
  sections.push("");
  sections.push(`**Health Check:** ${card.resonanceReadings.healthCheck}`);
  sections.push(`**SLA:** ${card.resonanceReadings.sla}`);
  sections.push("");

  sections.push("## Tools I Can Use (Forge Access)");
  card.forgeAccess.forEach((t) => sections.push(`- ${t}`));
  sections.push("");

  sections.push("## Memory & State (Crystal Memory)");
  sections.push("### Persists");
  card.crystalMemory.persists.forEach((p) => sections.push(`- ${p}`));
  sections.push("");
  sections.push("### Volatiles");
  card.crystalMemory.volatiles.forEach((v) => sections.push(`- ${v}`));

  return sections.join("\n");
}
