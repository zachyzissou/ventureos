function normalizeApiBase(rawBase) {
  const value = String(rawBase ?? "").trim();
  return value.replace(/\/+$/, "");
}

function resolveDashboardApiBase() {
  return normalizeApiBase(
    process.env.DASHBOARD_API_BASE
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
  const base = resolveDashboardApiBase();
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
