import { normalizeApiBase } from "./dashboard-api.js";

const DASHBOARD_API_BASE_HEADER = "x-dashboard-api-base";
const SUBJECT_HEADERS = [
  "x-ventureos-actor-id",
  "x-ventureos-binding-id",
  "x-ventureos-capability-id",
  "x-ventureos-specialist-id",
];

function resolveDashboardApiBase(request) {
  return normalizeApiBase(
    request.headers.get(DASHBOARD_API_BASE_HEADER)
      ?? process.env.DASHBOARD_API_BASE
      ?? process.env.NEXT_PUBLIC_DASHBOARD_API_BASE
      ?? "http://localhost:7000",
  );
}

function jsonError(status, error) {
  return Response.json({ ok: false, error }, { status });
}

function copyAuthHeaders(fromHeaders) {
  const nextHeaders = new Headers();

  const auth = fromHeaders.get("authorization");
  if (auth) nextHeaders.set("authorization", auth);

  const cookie = fromHeaders.get("cookie");
  if (cookie) nextHeaders.set("cookie", cookie);

  for (const headerName of SUBJECT_HEADERS) {
    const value = fromHeaders.get(headerName);
    if (value) nextHeaders.set(headerName, value);
  }

  nextHeaders.set("accept", "application/json");
  return nextHeaders;
}

function forwardResponse(upstream) {
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const cacheControl = upstream.headers.get("cache-control");
  const setCookie = upstream.headers.get("set-cookie");
  if (contentType) headers.set("content-type", contentType);
  if (cacheControl) headers.set("cache-control", cacheControl);
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

function resolveUpstreamPath(request, path) {
  const reqUrl = new URL(request.url);
  return `${path}${reqUrl.search}`;
}

export async function proxyTaskBoardRequest(request, path) {
  const base = resolveDashboardApiBase(request);
  if (!base) return jsonError(500, "Dashboard API base URL is not configured");

  const method = request.method.toUpperCase();
  const headers = copyAuthHeaders(request.headers);
  const init = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD") {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      try {
        const parsed = JSON.parse(raw);
        headers.set("content-type", "application/json");
        init.body = JSON.stringify(parsed);
      } catch {
        return jsonError(400, "Request body must be valid JSON");
      }
    }
  }

  try {
    const upstream = await fetch(`${base}${resolveUpstreamPath(request, path)}`, init);
    return forwardResponse(upstream);
  } catch {
    return jsonError(502, "Upstream dashboard request failed");
  }
}
