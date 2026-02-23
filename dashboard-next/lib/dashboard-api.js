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

export async function fetchDashboardJson(apiBase, path, token = "") {
  const base = normalizeApiBase(apiBase);
  if (!base) throw new Error("API base URL is required");
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(token),
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}
