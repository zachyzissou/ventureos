import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import type { AgentRoleCard, OperatingStyle } from '../role-cards/schema';
import { normalizeCapabilityId } from './agent-identity';

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
  operatingProfile: OperatingStyle;
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
  const primary = path.resolve(__dirname, '../../role-cards');
  if (existsSync(primary)) return primary;
  return path.resolve(process.cwd(), 'role-cards');
}

export function getDefaultRoleCardSchemaPath(): string {
  return path.join(getDefaultRoleCardsDir(), 'schema.json');
}

let ajv: Ajv | null = null;
const schemaValidators = new Map<string, ValidateFunction<RoleCard> | null>();

async function getSchemaValidator(schemaPath: string): Promise<ValidateFunction<RoleCard> | null> {
  const resolved = expandHome(schemaPath);
  if (schemaValidators.has(resolved)) return schemaValidators.get(resolved) ?? null;

  try {
    const schemaRaw = await fs.readFile(resolved, 'utf8');
    const schema = JSON.parse(schemaRaw) as Record<string, unknown>;
    ajv = ajv ?? new Ajv({ allErrors: true, strict: false });
    const compiled = ajv.compile<RoleCard>(schema);
    schemaValidators.set(resolved, compiled);
    return compiled;
  } catch {
    schemaValidators.set(resolved, null);
    return null;
  }
}

export async function validateRoleCard(
  card: unknown,
  opts: Pick<RoleCardLoadOptions, 'schemaPath'> = {},
): Promise<RoleCard> {
  const schemaPath = opts.schemaPath ?? getDefaultRoleCardSchemaPath();
  const validate = await getSchemaValidator(schemaPath);

  if (!validate) return card as RoleCard;

  const ok = validate(card);
  if (!ok) {
    throw new RoleCardValidationError(
      `Role card failed schema validation: ${(validate.errors ?? [])
        .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
        .join('; ')}`,
      (validate.errors ?? []) as ErrorObject[],
    );
  }

  return card as RoleCard;
}

function toRoleCard(card: AgentRoleCard): RoleCard {
  return {
    agentId: card.id,
    displayName: card.name,
    operatingProfile: card.operatingStyle,
    role: card.title,
    domain: {
      mission: card.domainScope.domain,
      responsibilities: card.domainScope.jurisdiction,
      boundaries: card.domainScope.boundaries,
    },
    inputs: card.operatingChannels.inputs.map((channel) => ({
      source: '*',
      type: channel.type,
      format: (['text', 'json', 'markdown', 'yaml', 'code'].includes(channel.format) ? channel.format : 'text') as RoleCardFormat,
      schema: channel.description ? { description: channel.description } : undefined,
      optional: false,
    })),
    outputs: card.operatingChannels.outputs.map((channel) => ({
      target: '*',
      type: channel.type,
      format: (['text', 'json', 'markdown', 'yaml', 'code'].includes(channel.format) ? channel.format : 'text') as RoleCardFormat,
      guarantees: channel.description ? [channel.description] : [],
      schema: channel.description ? { description: channel.description } : undefined,
    })),
    definitionOfDone: card.completionContract.conditions,
    hardBans: {
      infrastructure: card.hardBoundaries.hardBans.map((rule, idx) => ({
        rule,
        enforcement: 'permission_check',
        rationale: card.hardBoundaries.rationale[idx] ?? 'Policy guard',
      })),
      heuristic: card.hardBoundaries.hardBans.map((rule) => ({
        rule,
        enforcement: 'pattern_matcher',
        severity: 'block',
      })),
      quality: card.performanceMetrics.metrics.map((metric) => ({
        rule: metric.name,
        enforcement: 'manual_review',
        examples: [metric.measurement, metric.target],
      })),
    },
    escalation: {
      triggers: [
        ...card.escalationPolicy.escalateTo.map((target) => ({
          condition: 'Escalation target needed',
          action: `handoff to ${target}`,
          target,
          priority: 'medium' as const,
        })),
        ...card.escalationPolicy.escalateTriggers.map((condition) => ({
          condition,
          action: 'route per policy',
          priority: 'medium' as const,
        })),
      ],
      qualityTracking: {
        signalRatioTarget: 0.5,
        adaptiveSensitivity: true,
      },
    },
    metrics: card.performanceMetrics.metrics.map((metric) => ({
      name: metric.name,
      kpi_id: `${card.id}.${metric.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      category: 'quality',
    })),
    personalityProtocol: card.voiceProfile.voice,
    conversationDirectives: {
      alliance_pairs: Object.keys(card.affinityMap)
        .filter((partner) => card.affinityMap[partner] >= 0.75)
        .map((partner) => ({ agent: partner, directive: 'Collaborate strongly', affinity: card.affinityMap[partner] })),
    },
  };
}

function stripCardImportsAndTypes(source: string): string {
  return source
    .replace(/^\s*import[\s\S]*?;?\s*$/gm, '')
    .replace(/:\s*AgentRoleCard/g, '');
}

function extractExportedCardObject(source: string): AgentRoleCard | null {
  const match = source.match(/export\s+const\s+[A-Za-z0-9_]+\s*(?:[:][^=]+)?=\s*/);
  if (!match || match.index === undefined) return null;

  const tail = source.slice(match.index);
  const transformed = tail.replace(/export\s+const\s+[A-Za-z0-9_]+\s*(?:[:][^=]+)?=\s*/, 'const card = ');

  try {
    const fn = new Function(`${transformed}\nreturn card;`);
    return fn() as AgentRoleCard;
  } catch {
    return null;
  }
}

async function loadAgentRoleCardFromFile(file: string): Promise<AgentRoleCard> {
  const raw = await fs.readFile(file, 'utf8');
  const sanitized = stripCardImportsAndTypes(raw);
  const card = extractExportedCardObject(sanitized);
  if (!card) {
    throw new Error(`Failed to parse role card from ${file}`);
  }
  return card;
}

async function loadAgentRoleCard(agentId: string, roleCardsDir: string): Promise<AgentRoleCard> {
  const normalizedAgentId = normalizeCapabilityId(agentId) ?? agentId;
  const direct = path.join(roleCardsDir, `${normalizedAgentId}.ts`);
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
      if (idMatch && idMatch[1] === normalizedAgentId) {
        candidate = file;
        break;
      }
    }
  }

  if (!candidate) {
    throw new Error(`Unable to find role card file for ${agentId}`);
  }

  const card = await loadAgentRoleCardFromFile(candidate);
  if (card.id != null && card.id !== normalizedAgentId) {
    throw new Error(`Requested agentId ${agentId} but parsed card id is ${card.id}`);
  }

  return card;
}

export function getRoleCardFilePath(agentId: string, roleCardsDir = getDefaultRoleCardsDir()): string {
  return path.join(expandHome(roleCardsDir), `${agentId}.json`);
}

const roleCardCache = new Map<string, RoleCard>();

export async function loadRoleCard(agentId: string, opts: RoleCardLoadOptions = {}): Promise<RoleCard> {
  const normalizedAgentId = normalizeCapabilityId(agentId) ?? agentId;
  const roleCardsDir = opts.roleCardsDir ?? getDefaultRoleCardsDir();
  const schemaPath = opts.schemaPath ?? getDefaultRoleCardSchemaPath();
  const cacheKey = `${expandHome(roleCardsDir)}::${normalizedAgentId}`;
  const cached = roleCardCache.get(cacheKey);
  if (cached) return cached;

  const normalizedDir = expandHome(roleCardsDir);
  const jsonPath = path.join(normalizedDir, `${normalizedAgentId}.json`);
  let parsed: unknown;

  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    parsed = JSON.parse(raw) as unknown;
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      const sourceCard = await loadAgentRoleCard(normalizedAgentId, normalizedDir);
      parsed = toRoleCard(sourceCard);
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
      try {
        const card = await loadAgentRoleCardFromFile(path.join(roleCardsDir, entry.name));
        const normalized = toRoleCard(card);
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
  const lines: string[] = [];

  lines.push(`ROLE CARD :: ${card.agentId}`);
  lines.push(`Display: ${card.displayName}`);
  lines.push(`Operating Profile: ${card.operatingProfile}`);
  if (card.role) lines.push(`Role: ${card.role}`);
  lines.push('');

  lines.push('MISSION');
  lines.push(card.domain.mission.trim());
  lines.push('');

  lines.push('RESPONSIBILITIES');
  for (const responsibility of card.domain.responsibilities) lines.push(`- ${responsibility}`);
  lines.push('');

  lines.push('BOUNDARIES');
  for (const boundary of card.domain.boundaries) lines.push(`- ${boundary}`);
  lines.push('');

  lines.push('INPUT CONTRACTS');
  for (const input of card.inputs) {
    lines.push(`- from=${input.source} type=${input.type} format=${input.format}${input.optional ? ' (optional)' : ''}`);
  }
  lines.push('');

  lines.push('OUTPUT CONTRACTS');
  for (const output of card.outputs) {
    lines.push(`- to=${output.target} type=${output.type} format=${output.format}`);
    if (output.guarantees?.length) {
      for (const guarantee of output.guarantees) lines.push(`  - guarantee: ${guarantee}`);
    }
  }
  lines.push('');

  lines.push('DEFINITION OF DONE');
  for (const item of card.definitionOfDone) lines.push(`- ${item}`);
  lines.push('');

  lines.push('HARD BANS (Tier 1 Infrastructure — BLOCK)');
  for (const rule of card.hardBans.infrastructure) lines.push(`- ${rule.rule} [${rule.enforcement}]`);
  lines.push('');

  lines.push('HARD BANS (Tier 2 Heuristic — WARN/BLOCK/ESCALATE)');
  for (const rule of card.hardBans.heuristic) lines.push(`- ${rule.rule} [${rule.enforcement}] severity=${rule.severity}`);
  lines.push('');

  lines.push('QUALITY GUIDELINES (Tier 3 — LOG/TRAINING)');
  for (const rule of card.hardBans.quality) {
    lines.push(`- ${rule.rule} [${rule.enforcement}]`);
    if (rule.examples?.length) lines.push(`  - examples: ${rule.examples.join(', ')}`);
  }
  lines.push('');

  lines.push('ESCALATION TRIGGERS');
  for (const trigger of card.escalation.triggers) {
    lines.push(`- if ${trigger.condition} => ${trigger.action}${trigger.target ? ` (target=${trigger.target})` : ''}${trigger.priority ? ` priority=${trigger.priority}` : ''}`);
  }
  lines.push('');

  lines.push('METRICS');
  for (const metric of card.metrics) {
    lines.push(`- ${metric.name} (kpi_id=${metric.kpi_id}${metric.category ? ` category=${metric.category}` : ''})`);
  }

  return lines.join('\n');
}
