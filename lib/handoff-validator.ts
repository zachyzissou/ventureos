import Ajv from 'ajv';
import { loadRoleCard, type RoleCard } from './role-cards';
import { isWildcardTarget } from './contract-wildcards';

export interface HandoffResult {
  valid: boolean;
  reason?: string;
  contract?: {
    from: { agentId: string; outputType: string; format: string };
    to: { agentId: string; inputType: string; format: string };
  };
  errors?: string[];
}

export type HandoffPayload =
  | unknown
  | {
      type?: string;
      format?: string;
      data?: unknown;
    };

function isEnvelope(payload: any): payload is { type?: string; format?: string; data?: unknown } {
  return payload && typeof payload === 'object' && ('data' in payload || 'type' in payload || 'format' in payload);
}

function formatOk(expected: string, value: unknown): boolean {
  switch (expected) {
    case 'natural_language':
    case 'markdown':
    case 'yaml':
    case 'structured_query':
    case 'structured_report':
    case 'file_path':
    case 'url':
      return typeof value === 'string';
    case 'json':
      return value !== null && typeof value === 'object';
    default:
      return true;
  }
}

function findBestContract(fromCard: RoleCard, toCard: RoleCard, payload: HandoffPayload): { outputIdx: number; inputIdx: number } | null {
  const envelope = isEnvelope(payload) ? payload : null;
  const desiredType = envelope?.type;
  const desiredFormat = envelope?.format;

  // Candidate pairs: from.outputs -> to.inputs where target/source match.
  const candidates: Array<{ outputIdx: number; inputIdx: number; score: number }> = [];

  for (let oi = 0; oi < fromCard.outputs.length; oi++) {
    const o = fromCard.outputs[oi];
    // Wildcard semantics: '*', 'broadcast', and 'all' are treated as equivalent broadcast targets.
    if (!(o.target === toCard.agentId || isWildcardTarget(o.target))) continue;

    for (let ii = 0; ii < toCard.inputs.length; ii++) {
      const i = toCard.inputs[ii];
      if (!(i.source === fromCard.agentId || isWildcardTarget(i.source))) continue;

      let score = 0;
      if (o.type === i.type) score += 10;
      if (o.format === i.format) score += 5;
      if (desiredType && desiredType === i.type) score += 3;
      if (desiredFormat && desiredFormat === i.format) score += 2;

      candidates.push({ outputIdx: oi, inputIdx: ii, score });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { outputIdx: candidates[0].outputIdx, inputIdx: candidates[0].inputIdx };
}

const ajv = new Ajv({ allErrors: true, strict: false });

export async function validateHandoff(fromAgent: string, toAgent: string, payload: any): Promise<HandoffResult> {
  const fromCard = await loadRoleCard(fromAgent);
  const toCard = await loadRoleCard(toAgent);

  const contract = findBestContract(fromCard, toCard, payload);
  if (!contract) {
    return {
      valid: false,
      reason: `No contract between agents (${fromAgent} -> ${toAgent}). Ensure from.outputs includes target=${toAgent} and to.inputs includes source=${fromAgent}.`
    };
  }

  const output = fromCard.outputs[contract.outputIdx];
  const input = toCard.inputs[contract.inputIdx];

  const envelope = isEnvelope(payload) ? payload : null;
  const data = envelope?.data ?? payload;
  const errors: string[] = [];

  if (envelope?.type && envelope.type !== input.type) {
    errors.push(`Payload type mismatch: payload.type=${envelope.type} expected=${input.type}`);
  }
  if (envelope?.format && envelope.format !== input.format) {
    errors.push(`Payload format mismatch: payload.format=${envelope.format} expected=${input.format}`);
  }

  if (!formatOk(input.format, data)) {
    errors.push(`Payload data does not match expected format=${input.format}`);
  }

  // If the receiving agent declares a JSON schema, validate it.
  if ((input.format === 'json' || input.format === 'yaml') && input.schema) {
    try {
      const validate = ajv.compile(input.schema);
      const ok = validate(data);
      if (!ok) {
        const msg = (validate.errors ?? [])
          .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
          .join('; ');
        errors.push(`Schema validation failed: ${msg}`);
      }
    } catch (err) {
      errors.push(`Failed to compile/validate input schema: ${String(err)}`);
    }
  }

  return {
    valid: errors.length === 0,
    reason: errors.length ? 'Handoff validation failed' : undefined,
    errors: errors.length ? errors : undefined,
    contract: {
      from: { agentId: fromCard.agentId, outputType: output.type, format: output.format },
      to: { agentId: toCard.agentId, inputType: input.type, format: input.format }
    }
  };
}
