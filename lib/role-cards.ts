import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { existsSync } from 'node:fs';
import type { KhaydarinCard } from '../role-cards/schema';

export type RoleCardFormat =
  | 'natural_language'
  | 'json'
  | 'markdown'
  | 'yaml'
  | 'structured_query'
  | 'structured_report'
  | 'file_path'
  | 'url';

export interface RoleCardIO {
  source?: string;
  target?: string;
  type: string;
  format: RoleCardFormat;
  schema?: Record<string, unknown>;
  optional?: boolean;
  guarantees?: string[];
}

export interface RoleCard {
  agentId: string;
  displayName: string;
  protossUnit:
    | 'Zeratul'
    | 'Probe'
    | 'Sentinel'
    | 'High Templar'
    | 'Observer'
    | 'Dark Templar'
    | 'Executor'
    | 'Nexus';
  role?: string;
  domain: {
    mission: string;
    responsibilities: string[];
    boundaries: string[];
  };
  inputs: Array<Required<Pick<RoleCardIO, 'type' | 'format'>> & { source: string; schema?: Record<string, unknown>; optional?: boolean }>;
  outputs: Array<Required<Pick<RoleCardIO, 'type' | 'format'>> & { target: string; schema?: Record<string, unknown>; guarantees?: string[] }>;
  definitionOfDone: string[];
  hardBans: {
    infrastructure: Array<{ rule: string; enforcement: 'permission_check' | 'api_key_restriction' | 'network_policy' | 'file_system_permission'; rationale?: string }>;
    heuristic: Array<{ rule: string; enforcement: 'citation_detector' | 'number_source_tracker' | 'comparison_verifier' | 'pattern_matcher'; severity: 'warning' | 'block' | 'escalate'; falsePositiveRate?: number }>;
    quality: Array<{ rule: string; enforcement: 'training' | 'few_shot_examples' | 'manual_review'; examples?: string[] }>;
  };
  escalation: {
    triggers: Array<{ condition: string; action: string; target?: string; priority?: 'low' | 'medium' | 'high' | 'critical'; autoResolve?: boolean }>;
    qualityTracking?: { signalRatioTarget?: number; adaptiveSensitivity?: boolean };
  };
  metrics: Array<{ name: string; kpi_id: string; category?: 'quality' | 'reliability' | 'efficiency' | 'impact'; threshold?: Record<string, number> }>;
  interfaces?: { upstream?: string[]; core_partners?: string[]; downstream?: string[] };
  personalityProtocol?: string;
  conversationDirectives?: {
    conflict_pairs?: Array<{ agent: string; directive: string; affinity?: number }>;
    alliance_pairs?: Array<{ agent: string; directive: string; affinity?: number }>;
  };
}

export interface RoleCardLoadOptions {
  roleCardsDir?: string;
  schemaPath?: string;
  /** If true, ignore invalid/unsupported card files when loading all cards. */
  allowMissing?: boolean;
}

export class RoleCardValidationError extends Error {
  public readonly errors: ErrorObject[];

  constructor(message: string, errors: ErrorObject[]) {
    super(message);
    this.name = 'RoleCardValidationError';
    this.errors = errors;
  }
}

function expandHome(p: string): string {
  if (!p.startsWith('~/')) return p;
  const home = process.env.HOME;
  if (!home) return p;
  return path.join(home, p.slice(2));
}

function normalizeUnitsForLegacy(caste: KhaydarinCard['caste']): RoleCard['protossUnit'] {
  const byCaste: Record<KhaydarinCard['caste'], RoleCard['protossUnit']> = {
    templar: 'High Templar',
    judicator: 'Nexus',
    khalai: 'Probe',
    nerazim: 'Dark Templar',
  };

  return byCaste[caste] ?? 'Observer';
}

export function getDefaultRoleCardsDir(): string {
  // Usually this resolves to ventureos/lib -> ventureos/role-cards.
  const primary = path.resolve(__dirname, '../../role-cards');
  if (existsSync(primary)) return primary;

  // Fallback for jest/runtime from repository root or unusual compile locations.
  return path.resolve(process.cwd(), 'role-cards');
}

export function getDefaultRoleCardSchemaPath(): string {
  // No bundled JSON schema in repo yet; schema validation will fallback to a no-op.
  return path.join(getDefaultRoleCardsDir(), 'schema.json');
}

let _ajv: Ajv | null = null;
const _schemaValidators = new Map<string, ValidateFunction<RoleCard> | null>();

async function getSchemaValidator(schemaPath: string): Promise<ValidateFunction<RoleCard> | null> {
  const resolved = expandHome(schemaPath);
  if (_schemaValidators.has(resolved)) return _schemaValidators.get(resolved) ?? null;

  try {
    const schemaRaw = await fs.readFile(resolved, 'utf8');
    const schema = JSON.parse(schemaRaw) as Record<string, unknown>;

    _ajv = _ajv ?? new Ajv({ allErrors: true, strict: false });
    const compiled = _ajv.compile<RoleCard>(schema);
    _schemaValidators.set(resolved, compiled);
    return compiled;
  } catch (err) {
    // If schema isn't available yet, do not block startup.
    _schemaValidators.set(resolved, null);
    return null;
  }
}

export async function validateRoleCard(
  card: unknown,
  opts: Pick<RoleCardLoadOptions, 'schemaPath'> = {}
): Promise<RoleCard> {
  const schemaPath = opts.schemaPath ?? getDefaultRoleCardSchemaPath();
  const validate = await getSchemaValidator(schemaPath);

  if (!validate) return card as RoleCard;

  const ok = validate(card);
  if (!ok) {
    throw new RoleCardValidationError(
      `Role card failed schema validation: ${(validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()).join('; ')}`,
      (validate.errors ?? []) as ErrorObject[]
    );
  }
  return card as RoleCard;
}

function toLegacyRoleCard(card: KhaydarinCard): RoleCard {
  return {
    agentId: card.id,
    displayName: card.name,
    protossUnit: normalizeUnitsForLegacy(card.caste),
    role: card.title,
    domain: {
      mission: card.nexusSphere.domain,
      responsibilities: card.nexusSphere.jurisdiction,
      boundaries: card.nexusSphere.boundaries,
    },
    inputs: card.warpChannels.inputs.map((ch) => ({
      source: '*',
      type: ch.type,
      format: (['text', 'json', 'markdown', 'yaml', 'code'].includes(ch.format) ? ch.format : 'text') as RoleCardFormat,
      schema: ch.description ? { description: ch.description } : undefined,
      optional: false,
    })),
    outputs: card.warpChannels.outputs.map((ch) => ({
      target: '*',
      type: ch.type,
      format: (['text', 'json', 'markdown', 'yaml', 'code'].includes(ch.format) ? ch.format : 'text') as RoleCardFormat,
      guarantees: ch.description ? [ch.description] : [],
      schema: ch.description ? { description: ch.description } : undefined,
    })),
    definitionOfDone: card.warpComplete.conditions,
    hardBans: {
      infrastructure: card.voidInterdicts.hardBans.map((rule, idx) => ({
        rule,
        enforcement: 'permission_check',
        rationale: card.voidInterdicts.rationale[idx] ?? 'Policy guard',
      })),
      heuristic: card.voidInterdicts.hardBans.map((rule) => ({
        rule,
        enforcement: 'pattern_matcher',
        severity: 'block',
      })),
      quality: card.resonanceReadings.metrics.map((metric) => ({
        rule: metric.name,
        enforcement: 'manual_review',
        examples: [metric.measurement, metric.target],
      })),
    },
    escalation: {
      triggers: [
        ...card.psionicCascade.escalateTo.map((target) => ({ condition: 'Escalation target needed', action: `handoff to ${target}`, target, priority: 'medium' as const })),
        ...card.psionicCascade.escalateTriggers.map((condition) => ({ condition, action: 'route per policy', priority: 'medium' as const })),
      ],
      qualityTracking: {
        signalRatioTarget: 0.5,
        adaptiveSensitivity: true,
      },
    },
    metrics: card.resonanceReadings.metrics.map((metric) => ({
      name: metric.name,
      kpi_id: `${card.id}.${metric.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      category: 'quality',
    })),
    personalityProtocol: card.psionicSignature.voice,
    conversationDirectives: {
      alliance_pairs: Object.keys(card.khalaBonds)
        .filter((partner) => card.khalaBonds[partner] >= 0.75)
        .map((partner) => ({ agent: partner, directive: 'Collaborate strongly', affinity: card.khalaBonds[partner] })),
    },
  };
}

function stripKhaydarinImportsAndTypes(source: string): string {
  // NOTE(security): role-cards directory is a trusted boundary; we still strip imports/types
  // to reduce parse surprises in our constrained object-literal extraction path.
  let sanitized = source
    .replace(/^\s*import[\s\S]*?;?\s*$/gm, '')
    .replace(/:\s*KhaydarinCard/g, '');

  return sanitized;
}

function extractExportedKhaydarinObject(source: string): KhaydarinCard | null {
  const match = source.match(/export\s+const\s+[A-Za-z0-9_]+\s*(?:[:][^=]+)?=\s*/);
  if (!match || match.index === undefined) return null;

  const tail = source.slice(match.index);
  const transformed = tail.replace(
    /export\s+const\s+[A-Za-z0-9_]+\s*(?:[:][^=]+)?=\s*/,
    'const card = '
  );

  try {
    // SECURITY: This executes local role-card source. Treat role-cards dir as trusted-only.
    // M5 will add explicit deployment preflight checks for directory permissions.
    const fn = new Function(`${transformed}
return card;`);
    return fn() as KhaydarinCard;
  } catch {
    return null;
  }
}


async function loadKhaydarinRoleCardFromFile(file: string): Promise<KhaydarinCard> {
  const raw = await fs.readFile(file, 'utf8');
  const sanitized = stripKhaydarinImportsAndTypes(raw);
  const card = extractExportedKhaydarinObject(sanitized);
  if (!card) {
    throw new Error(`Failed to parse Khaydarin card from ${file}`);
  }
  return card;
}

async function loadKhaydarinRoleCard(agentId: string, roleCardsDir: string): Promise<KhaydarinCard> {
  const direct = path.join(roleCardsDir, `${agentId}.ts`);
  let candidate: string | null = null;

  try {
    await fs.access(direct);
    candidate = direct;
  } catch {
    const dirEntries = await fs.readdir(roleCardsDir, { withFileTypes: true });
    const tsCards = dirEntries.filter((entry) => entry.isFile() && /^\d+-/.test(entry.name) && entry.name.endsWith('.ts'));

    for (const entry of tsCards) {
      const file = path.join(roleCardsDir, entry.name);
      const sample = await fs.readFile(file, 'utf8');
      const idMatch = sample.match(/id:\s*["']([^"']+)["']/);
      if (idMatch && idMatch[1] === agentId) {
        candidate = file;
        break;
      }
    }
  }

  if (!candidate) {
    throw new Error(`Unable to find Khaydarin card file for ${agentId}`);
  }

  const card = await loadKhaydarinRoleCardFromFile(candidate);
  if (card.id != null && card.id !== agentId) {
    throw new Error(`Requested agentId ${agentId} but parsed card id is ${card.id}`);
  }

  return card;
}

export function getRoleCardFilePath(agentId: string, roleCardsDir = getDefaultRoleCardsDir()): string {
  return path.join(expandHome(roleCardsDir), `${agentId}.json`);
}

const roleCardCache = new Map<string, RoleCard>();

export async function loadRoleCard(agentId: string, opts: RoleCardLoadOptions = {}): Promise<RoleCard> {
  const roleCardsDir = opts.roleCardsDir ?? getDefaultRoleCardsDir();
  const schemaPath = opts.schemaPath ?? getDefaultRoleCardSchemaPath();
  const cacheKey = `${expandHome(roleCardsDir)}::${agentId}`;

  const cached = roleCardCache.get(cacheKey);
  if (cached) return cached;

  const normalizedDir = expandHome(roleCardsDir);
  const jsonPath = path.join(normalizedDir, `${agentId}.json`);
  let parsed: unknown;
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    parsed = JSON.parse(raw) as unknown;
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      // Legacy source format in this repo is TypeScript Khaydarin cards.
      const khaydarCard = await loadKhaydarinRoleCard(agentId, normalizedDir);
      parsed = toLegacyRoleCard(khaydarCard);
    } else {
      throw err;
    }
  }

  const validated = await validateRoleCard(parsed, { schemaPath });
  roleCardCache.set(cacheKey, validated);
  return validated;
}

export async function loadAllRoleCards(opts: RoleCardLoadOptions = {}): Promise<RoleCard[]> {
  const roleCardsDir = expandHome(opts.roleCardsDir ?? getDefaultRoleCardsDir());
  const schemaPath = opts.schemaPath ?? getDefaultRoleCardSchemaPath();

  const entries = await fs.readdir(roleCardsDir, { withFileTypes: true });
  const cards: RoleCard[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const isJson = entry.name.endsWith('.json');
    const isTs = entry.name.endsWith('.ts');
    if (!isJson && !isTs) continue;
    if (entry.name === 'schema.json' || entry.name.startsWith('schema.')) continue;
    if (entry.name.startsWith('_')) continue;

    const agentIdFromFile = entry.name.replace(/\.(json|ts)$/i, '');

    if (/^(0[1-9]|[1-9]\d)-/.test(agentIdFromFile) && isTs) {
      // Number-prefixed files (01- through 99-, e.g. 01-echo.ts) require parsing to get canonical id.
      try {
        const card = await loadKhaydarinRoleCardFromFile(path.join(roleCardsDir, entry.name));
        const normalized = toLegacyRoleCard(card);
        roleCardCache.set(`${roleCardsDir}::${normalized.agentId}`, normalized);
        cards.push(normalized);
        continue;
      } catch (err) {
        if (!opts.allowMissing) throw err;
        continue;
      }
    }

    try {
      cards.push(await loadRoleCard(agentIdFromFile, { roleCardsDir, schemaPath }));
    } catch (err) {
      if (opts.allowMissing) continue;
      throw err;
    }
  }

  return cards;
}

export function renderRoleCardForSystemPrompt(card: RoleCard): string {
  // Keep this as deterministic and easy to diff.
  const lines: string[] = [];

  lines.push(`ROLE CARD :: ${card.agentId}`);
  lines.push(`Display: ${card.displayName}`);
  lines.push(`Unit: ${card.protossUnit}`);
  if (card.role) lines.push(`Role: ${card.role}`);
  lines.push('');

  lines.push('MISSION');
  lines.push(card.domain.mission.trim());
  lines.push('');

  lines.push('RESPONSIBILITIES');
  for (const r of card.domain.responsibilities) lines.push(`- ${r}`);
  lines.push('');

  lines.push('BOUNDARIES');
  for (const b of card.domain.boundaries) lines.push(`- ${b}`);
  lines.push('');

  lines.push('INPUT CONTRACTS');
  for (const i of card.inputs) {
    lines.push(`- from=${i.source} type=${i.type} format=${i.format}${i.optional ? ' (optional)' : ''}`);
  }
  lines.push('');

  lines.push('OUTPUT CONTRACTS');
  for (const o of card.outputs) {
    lines.push(`- to=${o.target} type=${o.type} format=${o.format}`);
    if (o.guarantees?.length) {
      for (const g of o.guarantees) lines.push(`  - guarantee: ${g}`);
    }
  }
  lines.push('');

  lines.push('DEFINITION OF DONE');
  for (const d of card.definitionOfDone) lines.push(`- ${d}`);
  lines.push('');

  lines.push('HARD BANS (Tier 1 Infrastructure — BLOCK)');
  for (const b of card.hardBans.infrastructure) lines.push(`- ${b.rule} [${b.enforcement}]`);
  lines.push('');

  lines.push('HARD BANS (Tier 2 Heuristic — WARN/BLOCK/ESCALATE)');
  for (const b of card.hardBans.heuristic) lines.push(`- ${b.rule} [${b.enforcement}] severity=${b.severity}`);
  lines.push('');

  lines.push('QUALITY GUIDELINES (Tier 3 — LOG/TRAINING)');
  for (const b of card.hardBans.quality) {
    lines.push(`- ${b.rule} [${b.enforcement}]`);
    if (b.examples?.length) lines.push(`  - examples: ${b.examples.join(', ')}`);
  }
  lines.push('');

  lines.push('ESCALATION TRIGGERS');
  for (const t of card.escalation.triggers) {
    lines.push(`- if ${t.condition} => ${t.action}${t.target ? ` (target=${t.target})` : ''}${t.priority ? ` priority=${t.priority}` : ''}`);
  }
  lines.push('');

  lines.push('METRICS');
  for (const m of card.metrics) lines.push(`- ${m.name} (kpi_id=${m.kpi_id}${m.category ? ` category=${m.category}` : ''})`);

  return lines.join('\n');
}
