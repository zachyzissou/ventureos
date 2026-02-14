import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

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
  /** If true, ignore missing JSON files when loading all role cards. */
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

export function getDefaultRoleCardsDir(): string {
  // ventureos/lib -> clawd/agents/role-cards
  return path.resolve(__dirname, '../../agents/role-cards');
}

export function getDefaultRoleCardSchemaPath(): string {
  return path.join(getDefaultRoleCardsDir(), 'schema.json');
}

let _ajv: Ajv | null = null;
let _schemaValidator: ValidateFunction<RoleCard> | null = null;

async function getSchemaValidator(schemaPath: string): Promise<ValidateFunction<RoleCard>> {
  const resolved = expandHome(schemaPath);
  if (_schemaValidator) return _schemaValidator;

  const schemaRaw = await fs.readFile(resolved, 'utf8');
  const schema = JSON.parse(schemaRaw) as Record<string, unknown>;

  _ajv = _ajv ?? new Ajv({ allErrors: true, strict: false });
  _schemaValidator = _ajv.compile<RoleCard>(schema);

  return _schemaValidator;
}

export async function validateRoleCard(
  card: unknown,
  opts: Pick<RoleCardLoadOptions, 'schemaPath'> = {}
): Promise<RoleCard> {
  const schemaPath = opts.schemaPath ?? getDefaultRoleCardSchemaPath();
  const validate = await getSchemaValidator(schemaPath);

  const ok = validate(card);
  if (!ok) {
    throw new RoleCardValidationError(
      `Role card failed schema validation: ${(validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()).join('; ')}`,
      (validate.errors ?? []) as ErrorObject[]
    );
  }
  return card as RoleCard;
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

  const filePath = getRoleCardFilePath(agentId, roleCardsDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const validated = await validateRoleCard(parsed, { schemaPath });

  roleCardCache.set(cacheKey, validated);
  return validated;
}

export async function loadAllRoleCards(opts: RoleCardLoadOptions = {}): Promise<RoleCard[]> {
  const roleCardsDir = expandHome(opts.roleCardsDir ?? getDefaultRoleCardsDir());
  const schemaPath = opts.schemaPath ?? getDefaultRoleCardSchemaPath();

  const entries = await fs.readdir(roleCardsDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json') && e.name !== 'schema.json')
    .map((e) => e.name);

  const cards: RoleCard[] = [];
  for (const file of files) {
    const agentId = path.basename(file, '.json');
    try {
      cards.push(await loadRoleCard(agentId, { roleCardsDir, schemaPath }));
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
