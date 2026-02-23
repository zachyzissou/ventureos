import type {
  WorkflowBatchStepDefinition,
  WorkflowDefinition,
  WorkflowEvaluationContext,
  WorkflowStepDefinition,
} from './workflow-macros';

export function estimateTotalUnits(workflow: WorkflowDefinition, inputs: Record<string, unknown>): number {
  let units = 0;

  for (const step of workflow.steps) {
    if (step.type === 'batch') {
      const list = resolveBatchItems(step, inputs);
      units += Math.max(1, list.length);
      continue;
    }

    units += 1;
  }

  return Math.max(1, units);
}

export function resolveBatchItems(
  step: WorkflowBatchStepDefinition,
  inputs: Record<string, unknown>,
): unknown[] {
  const raw = getPathValue(inputs, step.itemsPath);
  if (!Array.isArray(raw)) return [];
  return raw;
}

export function evaluateCondition(
  condition: WorkflowStepDefinition['condition'],
  context: WorkflowEvaluationContext,
): boolean {
  if (condition === undefined) return true;

  if (typeof condition === 'function') {
    return Boolean(condition(context));
  }

  const raw = resolveTemplateValue(condition, {
    inputs: context.inputs,
    state: context.state,
    workflow: context.workflowName,
  });

  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === '') return false;
    return true;
  }

  return Boolean(raw);
}

export function resolveTemplateValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const whole = value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    if (whole) {
      const lookup = getPathValue(context, whole[1]);
      return lookup;
    }

    return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, path: string) => {
      const lookup = getPathValue(context, path);
      if (lookup === null || lookup === undefined) return '';
      return String(lookup);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, context));
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = resolveTemplateValue(v, context);
    }
    return out;
  }

  return value;
}

export function getPathValue(source: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.').map((part) => part.trim()).filter(Boolean);
  let current: unknown = source;

  for (const part of parts) {
    if (!isObjectLike(current)) return undefined;

    if (Array.isArray(current)) {
      const idx = Number(part);
      if (!Number.isInteger(idx)) return undefined;
      current = current[idx];
      continue;
    }

    current = current[part];
  }

  return current;
}

export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObjectLike(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}

export function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
