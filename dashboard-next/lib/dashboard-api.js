export const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_DASHBOARD_API_BASE ?? "http://localhost:7000";
export const DEFAULT_SUBJECT = {
  actorId: "venture-control",
  bindingId: "operations:operator",
  capabilityId: "venture_control",
  specialistId: "",
};

export function normalizeApiBase(rawBase) {
  const value = String(rawBase ?? "").trim();
  return value.replace(/\/+$/, "");
}

function normalizeSubject(subject = {}) {
  return {
    actorId: String(subject.actorId ?? "").trim(),
    bindingId: String(subject.bindingId ?? "").trim(),
    capabilityId: String(subject.capabilityId ?? "").trim(),
    specialistId: String(subject.specialistId ?? "").trim(),
  };
}

function applySubjectHeaders(headers, subject = {}) {
  const normalized = normalizeSubject(subject);
  if (normalized.actorId) headers["x-ventureos-actor-id"] = normalized.actorId;
  if (normalized.bindingId) headers["x-ventureos-binding-id"] = normalized.bindingId;
  if (normalized.capabilityId) headers["x-ventureos-capability-id"] = normalized.capabilityId;
  if (normalized.specialistId) headers["x-ventureos-specialist-id"] = normalized.specialistId;
}

export function buildAuthHeaders(token, extra = {}, subject = {}) {
  const headers = { Accept: "application/json", ...extra };
  const clean = String(token ?? "").trim();
  if (clean) headers.Authorization = `Bearer ${clean}`;
  applySubjectHeaders(headers, subject);
  return headers;
}

async function readResponseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function loginWithToken(apiBase, token) {
  const base = normalizeApiBase(apiBase);
  const clean = String(token ?? "").trim();
  if (!base || !clean) return;
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: clean }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
}

export async function requestDashboardJson(
  apiBase,
  path,
  { method = "GET", token = "", body = undefined, subject = DEFAULT_SUBJECT } = {},
) {
  const base = normalizeApiBase(apiBase);
  if (!base) throw new Error("API base URL is required");
  const headers = buildAuthHeaders(token, {}, subject);
  const init = {
    method,
    credentials: "include",
    headers,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${base}${path}`, {
    ...init,
  });
  if (!res.ok) {
    const payload = await readResponseJson(res);
    const detail =
      payload && typeof payload.error === "string" ? payload.error : "";
    if (detail) {
      throw new Error(`${path} failed (${res.status}): ${detail}`);
    }
    throw new Error(`${path} failed (${res.status})`);
  }
  return readResponseJson(res);
}

export async function fetchDashboardJson(apiBase, path, token = "", subject = DEFAULT_SUBJECT) {
  return requestDashboardJson(apiBase, path, { method: "GET", token, subject });
}

export async function requestLocalJson(
  path,
  { method = "GET", token = "", body = undefined, apiBase = "", subject = DEFAULT_SUBJECT } = {},
) {
  const headers = buildAuthHeaders(token, {}, subject);
  const normalizedBase = normalizeApiBase(apiBase);
  if (normalizedBase) headers["x-dashboard-api-base"] = normalizedBase;
  const init = {
    method,
    credentials: "include",
    headers,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(path, init);
  if (!res.ok) {
    const payload = await readResponseJson(res);
    const detail =
      payload && typeof payload.error === "string" ? payload.error : "";
    if (detail) {
      throw new Error(`${path} failed (${res.status}): ${detail}`);
    }
    throw new Error(`${path} failed (${res.status})`);
  }
  return readResponseJson(res);
}
