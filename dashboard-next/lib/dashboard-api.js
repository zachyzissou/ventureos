export const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_DASHBOARD_API_BASE ?? "http://localhost:7000";

export function normalizeApiBase(rawBase) {
  const value = String(rawBase ?? "").trim();
  return value.replace(/\/+$/, "");
}

export function buildAuthHeaders(token, extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  const clean = String(token ?? "").trim();
  if (clean) headers.Authorization = `Bearer ${clean}`;
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
  { method = "GET", token = "", body = undefined } = {},
) {
  const base = normalizeApiBase(apiBase);
  if (!base) throw new Error("API base URL is required");
  const headers = buildAuthHeaders(token);
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

export async function fetchDashboardJson(apiBase, path, token = "") {
  return requestDashboardJson(apiBase, path, { method: "GET", token });
}

export async function requestLocalJson(
  path,
  { method = "GET", token = "", body = undefined, apiBase = "" } = {},
) {
  const headers = buildAuthHeaders(token);
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
