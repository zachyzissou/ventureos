import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeCapabilityId } from './agent-identity.js';
import paths from './paths.js';

const { RUNTIME_LOG_DIR } = paths as typeof import('./paths.js');

export type ExchangeClassification =
  | 'public_operational'
  | 'internal_operational'
  | 'restricted_control'
  | 'security_sensitive';

export interface ExchangeApprovalRecord {
  binding_id: string;
  approved_at: string;
  note?: string;
}

export interface InterLaneExchangeEnvelope {
  exchange_id: string;
  artifact_type: string;
  producer_binding_id: string;
  producer_capability_id?: string;
  consumer_binding_id: string;
  issued_at: string;
  expires_at: string;
  classification: ExchangeClassification;
  integrity_hash: string;
  evidence_ref: string;
  transport_auth_class: string;
  approval_chain: ExchangeApprovalRecord[];
  nonce: string;
}

export interface MaterializeExchangeEnvelopeInput {
  exchange_id?: string;
  artifact_type: string;
  producer_binding_id: string;
  producer_capability_id?: string;
  consumer_binding_id?: string;
  issued_at?: string;
  expires_at?: string;
  classification?: ExchangeClassification;
  integrity_hash?: string;
  evidence_ref?: string;
  transport_auth_class?: string;
  approval_chain?: ExchangeApprovalRecord[];
  nonce?: string;
  payload?: unknown;
}

interface ReplayIndexEntry {
  exchange_id: string;
  nonce: string;
  issued_at: string;
  expires_at: string;
}

interface ReplayIndexStore {
  entries: ReplayIndexEntry[];
}

export interface ExchangeValidationResult {
  ok: boolean;
  errors: string[];
}

function isCanonicalBindingId(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[a-z_]+:[a-z_]+$/.test(String(value).trim());
}

function isHexSha256(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[a-f0-9]{64}$/.test(String(value).trim().toLowerCase());
}

function parseTimestamp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeApprovalChain(input: ExchangeApprovalRecord[] | undefined): ExchangeApprovalRecord[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      binding_id: String(entry.binding_id ?? '').trim(),
      approved_at: String(entry.approved_at ?? '').trim(),
      note: typeof entry.note === 'string' && entry.note.trim() ? entry.note.trim() : undefined,
    }))
    .filter((entry) => entry.binding_id.length > 0 || entry.approved_at.length > 0);
}

function normalizeClassification(input: string | null | undefined): ExchangeClassification {
  if (
    input === 'public_operational'
    || input === 'internal_operational'
    || input === 'restricted_control'
    || input === 'security_sensitive'
  ) {
    return input;
  }
  return 'internal_operational';
}

function defaultExpiry(issuedAt: string): string {
  const issuedMs = parseTimestamp(issuedAt) ?? Date.now();
  return new Date(issuedMs + (4 * 60 * 60 * 1000)).toISOString();
}

export function buildExchangeIntegrityHash(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload ?? null))
    .digest('hex');
}

export function validateInterLaneExchangeEnvelope(
  envelope: InterLaneExchangeEnvelope,
  now = new Date(),
): ExchangeValidationResult {
  const errors: string[] = [];

  if (!String(envelope.exchange_id ?? '').trim()) {
    errors.push('exchange_id is required');
  }
  if (!String(envelope.artifact_type ?? '').trim()) {
    errors.push('artifact_type is required');
  }
  if (!isCanonicalBindingId(envelope.producer_binding_id)) {
    errors.push('producer_binding_id must be a canonical VentureOS binding');
  }
  if (!isCanonicalBindingId(envelope.consumer_binding_id)) {
    errors.push('consumer_binding_id must be a canonical VentureOS binding');
  }
  if (envelope.producer_capability_id && !normalizeCapabilityId(envelope.producer_capability_id)) {
    errors.push('producer_capability_id must resolve to a canonical VentureOS capability');
  }
  if (!String(envelope.evidence_ref ?? '').trim()) {
    errors.push('evidence_ref is required');
  }
  if (!String(envelope.transport_auth_class ?? '').trim()) {
    errors.push('transport_auth_class is required');
  }
  if (!String(envelope.nonce ?? '').trim()) {
    errors.push('nonce is required');
  }
  if (!isHexSha256(envelope.integrity_hash)) {
    errors.push('integrity_hash must be a sha256 hex digest');
  }

  const issuedAtMs = parseTimestamp(envelope.issued_at);
  const expiresAtMs = parseTimestamp(envelope.expires_at);
  if (issuedAtMs === null) {
    errors.push('issued_at must be a valid ISO timestamp');
  }
  if (expiresAtMs === null) {
    errors.push('expires_at must be a valid ISO timestamp');
  }
  if (issuedAtMs !== null && expiresAtMs !== null && expiresAtMs <= issuedAtMs) {
    errors.push('expires_at must be later than issued_at');
  }
  if (expiresAtMs !== null && expiresAtMs <= now.getTime()) {
    errors.push('exchange envelope is expired');
  }

  for (const approval of envelope.approval_chain ?? []) {
    if (!isCanonicalBindingId(approval.binding_id)) {
      errors.push(`approval_chain contains non-canonical binding_id: ${approval.binding_id}`);
    }
    if (parseTimestamp(approval.approved_at) === null) {
      errors.push(`approval_chain contains invalid approved_at: ${approval.approved_at}`);
    }
  }

  if (
    (envelope.classification === 'restricted_control' || envelope.classification === 'security_sensitive')
    && (!Array.isArray(envelope.approval_chain) || envelope.approval_chain.length === 0)
  ) {
    errors.push('restricted_control and security_sensitive exchanges require an approval_chain');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function materializeInterLaneExchangeEnvelope(
  input: MaterializeExchangeEnvelopeInput,
): { ok: true; envelope: InterLaneExchangeEnvelope } | { ok: false; error: string } {
  const issuedAt = input.issued_at ?? new Date().toISOString();
  const envelope: InterLaneExchangeEnvelope = {
    exchange_id: String(input.exchange_id ?? `exch-${crypto.randomUUID().slice(0, 12)}`).trim(),
    artifact_type: String(input.artifact_type ?? '').trim(),
    producer_binding_id: String(input.producer_binding_id ?? '').trim(),
    producer_capability_id: normalizeCapabilityId(input.producer_capability_id ?? '') ?? undefined,
    consumer_binding_id: String(input.consumer_binding_id ?? input.producer_binding_id ?? '').trim(),
    issued_at: issuedAt,
    expires_at: input.expires_at ?? defaultExpiry(issuedAt),
    classification: normalizeClassification(input.classification),
    integrity_hash: input.integrity_hash ?? buildExchangeIntegrityHash(input.payload),
    evidence_ref: String(input.evidence_ref ?? '').trim(),
    transport_auth_class: String(input.transport_auth_class ?? 'dashboard_api_token').trim(),
    approval_chain: normalizeApprovalChain(input.approval_chain),
    nonce: String(input.nonce ?? `nonce-${crypto.randomUUID().slice(0, 12)}`).trim(),
  };

  const validation = validateInterLaneExchangeEnvelope(envelope);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join('; ') };
  }

  return { ok: true, envelope };
}

function readReplayIndex(filePath: string): ReplayIndexStore {
  try {
    if (!fs.existsSync(filePath)) return { entries: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<ReplayIndexStore>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries as ReplayIndexEntry[] : [],
    };
  } catch {
    return { entries: [] };
  }
}

function pruneReplayEntries(entries: ReplayIndexEntry[], replayWindowMs: number, nowMs: number): ReplayIndexEntry[] {
  return entries.filter((entry) => {
    const issuedAtMs = parseTimestamp(entry.issued_at);
    const expiresAtMs = parseTimestamp(entry.expires_at);
    if (issuedAtMs === null || expiresAtMs === null) return false;
    if (expiresAtMs <= nowMs) return false;
    return issuedAtMs >= (nowMs - replayWindowMs);
  });
}

export function reserveInterLaneExchangeEnvelope(
  filePath: string,
  envelope: InterLaneExchangeEnvelope,
  replayWindowMs = 24 * 60 * 60 * 1000,
): { ok: true } | { ok: false; error: string } {
  const nowMs = Date.now();
  const store = readReplayIndex(filePath);
  const entries = pruneReplayEntries(store.entries, replayWindowMs, nowMs);

  if (entries.some((entry) => entry.exchange_id === envelope.exchange_id)) {
    return { ok: false, error: `exchange_id already consumed within replay window: ${envelope.exchange_id}` };
  }
  if (entries.some((entry) => entry.nonce === envelope.nonce)) {
    return { ok: false, error: `nonce already consumed within replay window: ${envelope.nonce}` };
  }

  entries.push({
    exchange_id: envelope.exchange_id,
    nonce: envelope.nonce,
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
  });

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ entries }, null, 2), 'utf8');
  return { ok: true };
}

export function appendInterLaneExchangeEvidence(
  relativeName: string,
  envelope: InterLaneExchangeEnvelope,
  metadata: Record<string, unknown> = {},
): string {
  const safeName = String(relativeName || 'inter-lane-exchanges')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const runtimeLogDir = process.env.VENTUREOS_RUNTIME_LOG_DIR ?? RUNTIME_LOG_DIR;
  const logPath = path.join(runtimeLogDir, 'task_runs', `${safeName}.jsonl`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({ ts: new Date().toISOString(), envelope, metadata })}\n`,
    'utf8',
  );
  return logPath;
}
