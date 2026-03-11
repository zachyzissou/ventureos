const TASK_STATUSES = [
  "backlog",
  "queued",
  "running",
  "blocked",
  "review",
  "done",
  "failed",
];

const TASK_PRIORITIES = ["critical", "high", "medium", "low"];

const TASK_TRANSITIONS = {
  backlog: ["queued", "blocked", "review", "done"],
  queued: ["running", "blocked", "backlog", "done"],
  running: ["review", "blocked", "done", "failed"],
  blocked: ["queued", "running", "review", "done"],
  review: ["running", "done", "blocked"],
  done: ["backlog"],
  failed: ["backlog", "queued", "blocked"],
};

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(status) {
  const clean = asString(status, "backlog").toLowerCase();
  return TASK_STATUSES.includes(clean) ? clean : "backlog";
}

function normalizePriority(priority) {
  const clean = asString(priority, "medium").toLowerCase();
  return TASK_PRIORITIES.includes(clean) ? clean : "medium";
}

function normalizeTaskCard(row) {
  const card = asRecord(row) ?? {};
  return {
    id: asString(card.id, ""),
    title: asString(card.title, "Untitled task"),
    description: asString(card.description, ""),
    status: normalizeStatus(card.status),
    priority: normalizePriority(card.priority),
    assigneeId: asString(card.assigneeId, card.agentId ? asString(card.agentId, "") : ""),
    missionId: asString(card.missionId, ""),
    missionBrief: asString(card.missionBrief, ""),
    createdAt: asNumber(card.createdAt, 0),
    updatedAt: asNumber(card.updatedAt, 0),
  };
}

function normalizeColumnCounts(value) {
  const raw = asRecord(value) ?? {};
  const columns = {};
  for (const status of TASK_STATUSES) {
    columns[status] = asNumber(raw[status], 0);
  }
  return columns;
}

export function normalizeTaskBoardListPayload(payload) {
  const root = asRecord(payload) ?? {};
  const tasks = asArray(root.tasks).map((row) => normalizeTaskCard(row));
  return {
    tasks,
    total: asNumber(root.total, tasks.length),
  };
}

export function normalizeTaskBoardSummaryPayload(payload) {
  const root = asRecord(payload) ?? {};
  return {
    total: asNumber(root.total, 0),
    updatedAt: asNumber(root.updatedAt, 0),
    columns: normalizeColumnCounts(root.columns),
  };
}

export function normalizeTaskBoardPayload(listPayload, summaryPayload) {
  const list = normalizeTaskBoardListPayload(listPayload);
  const summary = normalizeTaskBoardSummaryPayload(summaryPayload);
  return {
    tasks: list.tasks,
    total: list.total,
    summary,
  };
}

export function allowedTransitions(status) {
  const current = normalizeStatus(status);
  return TASK_TRANSITIONS[current] ?? [];
}

export { TASK_PRIORITIES, TASK_STATUSES };
