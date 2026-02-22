import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type {
  TaskAssigneeType,
  TaskBoardDeps,
  TaskCard,
  TaskPipelineStageTemplate,
  TaskPipelineTemplate,
  TaskStatus,
} from '../types.js';
import { sanitizeStringList } from './task-board-utils.js';

const VALID_ASSIGNEE_TYPES: TaskAssigneeType[] = ['human', 'nexus', 'agent'];
const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-_]{1,63}$/;
const STAGE_ID_RE = /^[a-z0-9][a-z0-9-_]{1,63}$/;
const TEMPLATE_TAG_RE = /^#?[a-z0-9][a-z0-9:_-]{0,31}$/i;

const SYSTEM_TEMPLATE_EPOCH = 1_700_000_000_000;
const SYSTEM_PIPELINE_TEMPLATES: TaskPipelineTemplate[] = [
  {
    id: 'content-idea-script-publish',
    name: 'Content: Idea -> Script -> Publish',
    description: 'Reusable multi-stage content production flow with explicit handoff contracts.',
    category: 'content',
    tags: ['#content', '#pipeline', '#publish'],
    source: 'system',
    createdAt: SYSTEM_TEMPLATE_EPOCH,
    updatedAt: SYSTEM_TEMPLATE_EPOCH,
    stages: [
      {
        id: 'idea',
        title: 'Idea Brief',
        assigneeType: 'nexus',
        assigneeId: 'nexus',
        handoffContract: 'Produce a concise concept brief with audience + outcome.',
      },
      {
        id: 'script',
        title: 'Script Draft',
        assigneeType: 'agent',
        assigneeId: 'synth',
        handoffContract: 'Deliver script draft with structure, hooks, and call-to-action.',
      },
      {
        id: 'thumbnail',
        title: 'Thumbnail Direction',
        assigneeType: 'agent',
        assigneeId: 'synth',
        handoffContract: 'Provide visual direction and copy variants for thumbnail selection.',
      },
      {
        id: 'filming',
        title: 'Filming / Capture',
        assigneeType: 'human',
        assigneeId: null,
        handoffContract: 'Capture footage/assets following approved script and direction.',
      },
      {
        id: 'publish',
        title: 'Publish + Distribution',
        assigneeType: 'nexus',
        assigneeId: 'nexus',
        handoffContract: 'Publish artifact, attach links, and verify live distribution.',
        requiresApproval: true,
      },
    ],
  },
  {
    id: 'generic-research-build-ship',
    name: 'Generic: Research -> Build -> Ship',
    description: 'General-purpose template for non-content execution pipelines.',
    category: 'generic',
    tags: ['#generic', '#delivery'],
    source: 'system',
    createdAt: SYSTEM_TEMPLATE_EPOCH,
    updatedAt: SYSTEM_TEMPLATE_EPOCH,
    stages: [
      {
        id: 'research',
        title: 'Research and Scope',
        assigneeType: 'agent',
        assigneeId: 'oracle',
        handoffContract: 'Document assumptions, constraints, and acceptance boundaries.',
      },
      {
        id: 'implementation',
        title: 'Implementation',
        assigneeType: 'agent',
        assigneeId: 'synth',
        handoffContract: 'Produce implementation artifacts linked to mission context.',
      },
      {
        id: 'verification',
        title: 'Verification',
        assigneeType: 'agent',
        assigneeId: 'verifier',
        handoffContract: 'Attach validation evidence and explicit pass/fail verdict.',
      },
      {
        id: 'ship',
        title: 'Ship / Rollout',
        assigneeType: 'nexus',
        assigneeId: 'nexus',
        handoffContract: 'Record release outcome and final source-of-truth links.',
        requiresApproval: true,
      },
    ],
  },
];

function pipelineTemplateFilePath(dataDir: string): string {
  return path.join(dataDir, 'task-board-templates.json');
}

function compactSlug(raw: string, fallback: string): string {
  const s = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

function normalizeTag(tag: string): string | null {
  const t = tag.trim();
  if (!t) return null;
  if (!TEMPLATE_TAG_RE.test(t)) return null;
  const canonical = t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase()}`;
  return canonical.slice(0, 32);
}

function normalizeTemplateStage(
  raw: unknown,
  idx: number,
): TaskPipelineStageTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = String((raw as { title?: string }).title ?? '').trim();
  if (!title) return null;
  if (title.length > 120) return null;

  const idRaw = String((raw as { id?: string }).id ?? '').trim();
  const stageId = compactSlug(idRaw || title, `stage-${idx + 1}`).slice(0, 64);
  if (!STAGE_ID_RE.test(stageId)) return null;

  const descriptionRaw = (raw as { description?: unknown }).description;
  const description = typeof descriptionRaw === 'string' && descriptionRaw.trim()
    ? descriptionRaw.trim().slice(0, 400)
    : null;

  const assigneeTypeRaw = (raw as { assigneeType?: unknown }).assigneeType;
  const assigneeType = typeof assigneeTypeRaw === 'string' &&
    VALID_ASSIGNEE_TYPES.includes(assigneeTypeRaw as TaskAssigneeType)
    ? (assigneeTypeRaw as TaskAssigneeType)
    : undefined;

  const assigneeIdRaw = (raw as { assigneeId?: unknown }).assigneeId;
  const assigneeId = typeof assigneeIdRaw === 'string' && assigneeIdRaw.trim()
    ? assigneeIdRaw.trim().slice(0, 120)
    : null;

  const handoffRaw = (raw as { handoffContract?: unknown }).handoffContract;
  const handoffContract = typeof handoffRaw === 'string' && handoffRaw.trim()
    ? handoffRaw.trim().slice(0, 240)
    : null;

  return {
    id: stageId,
    title,
    description,
    assigneeType,
    assigneeId,
    handoffContract,
    requiresApproval: (raw as { requiresApproval?: unknown }).requiresApproval === true,
  };
}

function normalizePipelineTemplate(
  raw: unknown,
  source: 'system' | 'custom',
): TaskPipelineTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String((raw as { name?: string }).name ?? '').trim();
  if (!name || name.length > 120) return null;

  const idRaw = String((raw as { id?: string }).id ?? '').trim();
  const id = compactSlug(idRaw || name, source === 'system' ? 'template' : 'custom-template').slice(0, 64);
  if (!TEMPLATE_ID_RE.test(id)) return null;

  const stagesRaw = (raw as { stages?: unknown }).stages;
  if (!Array.isArray(stagesRaw) || stagesRaw.length < 2 || stagesRaw.length > 20) return null;
  const stages: TaskPipelineStageTemplate[] = [];
  const seenStageIds = new Set<string>();
  for (let i = 0; i < stagesRaw.length; i++) {
    const stage = normalizeTemplateStage(stagesRaw[i], i);
    if (!stage) return null;
    if (seenStageIds.has(stage.id)) return null;
    seenStageIds.add(stage.id);
    stages.push(stage);
  }

  const descriptionRaw = (raw as { description?: unknown }).description;
  const categoryRaw = (raw as { category?: unknown }).category;
  const tagsRaw = sanitizeStringList((raw as { tags?: unknown }).tags, { maxItems: 12, maxLen: 32 });
  const tags = tagsRaw
    .map((t) => normalizeTag(t))
    .filter((t): t is string => !!t);

  const createdAtRaw = (raw as { createdAt?: unknown }).createdAt;
  const updatedAtRaw = (raw as { updatedAt?: unknown }).updatedAt;
  const now = Date.now();
  const createdAt = typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw) && createdAtRaw > 0
    ? Math.trunc(createdAtRaw)
    : now;
  const updatedAt = typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw) && updatedAtRaw > 0
    ? Math.trunc(updatedAtRaw)
    : now;

  return {
    id,
    name,
    description: typeof descriptionRaw === 'string' && descriptionRaw.trim()
      ? descriptionRaw.trim().slice(0, 600)
      : null,
    category: typeof categoryRaw === 'string' && categoryRaw.trim()
      ? categoryRaw.trim().slice(0, 80)
      : null,
    tags,
    stages,
    createdAt,
    updatedAt,
    source,
  };
}

export function loadCustomPipelineTemplates(dataDir: string): TaskPipelineTemplate[] {
  try {
    const fp = pipelineTemplateFilePath(dataDir);
    if (!fs.existsSync(fp)) return [];
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed && Array.isArray(parsed.templates) ? parsed.templates : []);
    const out: TaskPipelineTemplate[] = [];
    for (const item of arr) {
      const tpl = normalizePipelineTemplate(item, 'custom');
      if (tpl) out.push(tpl);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomPipelineTemplates(dataDir: string, templates: TaskPipelineTemplate[]): void {
  const fp = pipelineTemplateFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    fp,
    JSON.stringify({ templates, updatedAt: Date.now() }, null, 2),
  );
}

export function loadPipelineTemplates(dataDir: string): TaskPipelineTemplate[] {
  const map = new Map<string, TaskPipelineTemplate>();
  for (const sysTpl of SYSTEM_PIPELINE_TEMPLATES) {
    map.set(sysTpl.id, sysTpl);
  }
  for (const customTpl of loadCustomPipelineTemplates(dataDir)) {
    map.set(customTpl.id, customTpl);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function isSystemPipelineTemplateId(id: string): boolean {
  return SYSTEM_PIPELINE_TEMPLATES.some((template) => template.id === id);
}

interface TemplateUpsertInput {
  id?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: unknown;
  stages?: unknown;
}

export function validateTemplateUpsert(body: unknown): { ok: true; template: TaskPipelineTemplate } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object' };
  }

  const input = body as TemplateUpsertInput;
  const name = String(input.name ?? '').trim();
  if (!name) return { ok: false, error: 'name is required' };
  if (name.length > 120) return { ok: false, error: 'name must be ≤ 120 chars' };

  const idSeed = String(input.id ?? '').trim() || name;
  const id = compactSlug(idSeed, 'custom-template').slice(0, 64);
  if (!TEMPLATE_ID_RE.test(id)) {
    return { ok: false, error: 'id must match [a-z0-9][a-z0-9-_]{1,63}' };
  }

  if (!Array.isArray(input.stages)) {
    return { ok: false, error: 'stages must be an array' };
  }
  if (input.stages.length < 2 || input.stages.length > 20) {
    return { ok: false, error: 'stages must contain between 2 and 20 entries' };
  }

  const stages: TaskPipelineStageTemplate[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < input.stages.length; i++) {
    const stage = normalizeTemplateStage(input.stages[i], i);
    if (!stage) return { ok: false, error: `invalid stage at index ${i}` };
    if (seenIds.has(stage.id)) return { ok: false, error: `duplicate stage id: ${stage.id}` };
    seenIds.add(stage.id);
    stages.push(stage);
  }

  const tags = sanitizeStringList(input.tags, { maxItems: 12, maxLen: 32 })
    .map((t) => normalizeTag(t))
    .filter((t): t is string => !!t);

  const description = typeof input.description === 'string' && input.description.trim()
    ? input.description.trim().slice(0, 600)
    : null;
  const category = typeof input.category === 'string' && input.category.trim()
    ? input.category.trim().slice(0, 80)
    : null;

  const now = Date.now();
  return {
    ok: true,
    template: {
      id,
      name,
      description,
      category,
      tags,
      stages,
      createdAt: now,
      updatedAt: now,
      source: 'custom',
    },
  };
}

export interface PipelineFromTemplateInput {
  templateId?: string;
  pipelineName?: string;
  missionId?: string | null;
  missionBrief?: string | null;
  assigneeType?: string | null;
  assigneeId?: string | null;
  stageAssignments?: Record<string, { assigneeType?: string; assigneeId?: string | null }>;
}

export interface PipelineFromTemplateResult {
  ok: boolean;
  error?: string;
  pipelineId?: string;
  templateId?: string;
  created?: number;
  cards?: TaskCard[];
}

interface InstantiatePipelineFromTemplateOptions {
  dataDir: string;
  input: PipelineFromTemplateInput;
  emitEvent?: TaskBoardDeps['emitEvent'];
  loadTasks: () => TaskCard[];
  saveTasks: (tasks: TaskCard[]) => void;
}

export function instantiatePipelineFromTemplate(
  options: InstantiatePipelineFromTemplateOptions,
): PipelineFromTemplateResult {
  const templateId = String(options.input.templateId ?? '').trim();
  if (!templateId) return { ok: false, error: 'templateId is required' };

  const template = loadPipelineTemplates(options.dataDir).find((t) => t.id === templateId);
  if (!template) return { ok: false, error: `template not found: ${templateId}` };

  const pipelineName = String(options.input.pipelineName ?? '').trim() || template.name;
  if (pipelineName.length > 160) return { ok: false, error: 'pipelineName must be ≤ 160 chars' };

  const missionId = options.input.missionId?.trim() || null;
  if (missionId && missionId.length > 120) return { ok: false, error: 'missionId must be ≤ 120 chars' };
  const missionBrief = options.input.missionBrief?.trim() || pipelineName;
  if (missionBrief && missionBrief.length > 300) {
    return { ok: false, error: 'missionBrief must be ≤ 300 chars' };
  }

  const defaultAssigneeType = typeof options.input.assigneeType === 'string' &&
    VALID_ASSIGNEE_TYPES.includes(options.input.assigneeType as TaskAssigneeType)
    ? (options.input.assigneeType as TaskAssigneeType)
    : null;
  const defaultAssigneeId = options.input.assigneeId?.trim() || null;
  if (defaultAssigneeId && defaultAssigneeId.length > 120) {
    return { ok: false, error: 'assigneeId must be ≤ 120 chars' };
  }

  const stageAssignments = (
    options.input.stageAssignments &&
    typeof options.input.stageAssignments === 'object' &&
    !Array.isArray(options.input.stageAssignments)
  )
    ? options.input.stageAssignments as Record<string, unknown>
    : {};

  const tasks = options.loadTasks();
  const pipelineId = `pl-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const created: TaskCard[] = [];
  let prevCardId: string | null = null;
  const nowBase = Date.now();

  for (let i = 0; i < template.stages.length; i++) {
    const stage = template.stages[i];
    let overrideRaw: unknown = null;
    if (Object.prototype.hasOwnProperty.call(stageAssignments, stage.id)) {
      overrideRaw = stageAssignments[stage.id];
    }
    if (overrideRaw != null && (typeof overrideRaw !== 'object' || Array.isArray(overrideRaw))) {
      return { ok: false, error: `stageAssignments.${stage.id} must be an object` };
    }
    const override = (overrideRaw ?? null) as { assigneeType?: unknown; assigneeId?: unknown } | null;

    let overrideAssigneeType: TaskAssigneeType | null = null;
    if (override?.assigneeType != null) {
      if (typeof override.assigneeType !== 'string') {
        return { ok: false, error: `stageAssignments.${stage.id}.assigneeType must be a string` };
      }
      if (!VALID_ASSIGNEE_TYPES.includes(override.assigneeType as TaskAssigneeType)) {
        return { ok: false, error: `invalid assigneeType for stage ${stage.id}: ${override.assigneeType}` };
      }
      overrideAssigneeType = override.assigneeType as TaskAssigneeType;
    }

    const effectiveAssigneeType = overrideAssigneeType ?? stage.assigneeType ?? defaultAssigneeType ?? 'nexus';
    let overrideAssigneeId: string | null = null;
    if (override?.assigneeId != null) {
      if (typeof override.assigneeId !== 'string') {
        return { ok: false, error: `stageAssignments.${stage.id}.assigneeId must be a string` };
      }
      overrideAssigneeId = override.assigneeId.trim();
      if (overrideAssigneeId.length > 120) {
        return { ok: false, error: `stageAssignments.${stage.id}.assigneeId must be ≤ 120 chars` };
      }
    }
    const effectiveAssigneeId = (overrideAssigneeId || stage.assigneeId || defaultAssigneeId || null);
    const agentId = effectiveAssigneeType === 'agent' ? effectiveAssigneeId : null;

    const descriptionBits = [];
    if (stage.description) descriptionBits.push(stage.description);
    if (stage.handoffContract) descriptionBits.push(`Handoff Contract: ${stage.handoffContract}`);
    if (stage.requiresApproval) {
      descriptionBits.push('Approval Required: human final arbiter sign-off required before stage completion.');
    }

    const createdAt = nowBase + i;
    const status: TaskStatus = i === 0 ? 'queued' : 'backlog';
    const card: TaskCard = {
      id: crypto.randomUUID(),
      agentId,
      title: `${pipelineName} — ${stage.title}`,
      description: descriptionBits.join('\n\n'),
      priority: i === 0 ? 'high' : 'medium',
      status,
      createdAt,
      queuedAt: status === 'queued' ? createdAt : null,
      startedAt: null,
      completedAt: null,
      resultSummary: null,
      tokensUsed: null,
      error: null,
      costEstimate: null,
      runtimeMs: null,
      missionId,
      missionBrief,
      assigneeType: effectiveAssigneeType,
      assigneeId: effectiveAssigneeId,
      dependencies: prevCardId ? [prevCardId] : [],
      artifactLinks: [
        `pipeline:${pipelineId}`,
        `template:${template.id}`,
        `stage:${stage.id}`,
      ],
      replaySessionId: null,
      statusHistory: [
        {
          status,
          at: createdAt,
          by: 'pipeline-template',
          note: `pipeline:${pipelineId} stage:${stage.id}`,
        },
      ],
    };
    prevCardId = card.id;
    tasks.push(card);
    created.push(card);
  }

  options.saveTasks(tasks);
  for (const card of created) options.emitEvent?.('task:created', card);

  return {
    ok: true,
    pipelineId,
    templateId: template.id,
    created: created.length,
    cards: created,
  };
}
