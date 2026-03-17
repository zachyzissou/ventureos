import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import { GET as getBoard, POST as createTask } from "../app/api/task-board/route.js";
import { PATCH as patchTask } from "../app/api/task-board/[taskId]/route.js";

const upstreamRequests = [];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);
  upstreamRequests.push({
    method: req.method ?? "GET",
    url: req.url ?? "/",
    headers: req.headers,
    body,
  });

  const hasAuth = Boolean(req.headers.authorization || req.headers.cookie);
  const hasCanonicalSubject = Boolean(
    req.headers["x-ventureos-binding-id"] && req.headers["x-ventureos-capability-id"],
  );
  if ((req.method === "POST" || req.method === "PATCH") && !hasAuth) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Missing credentials" }));
    return;
  }
  if ((req.method === "POST" || req.method === "PATCH") && !hasCanonicalSubject) {
    res.statusCode = 403;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Missing canonical subject" }));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/task-board?")) {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, tasks: [] }));
    return;
  }

  if (req.method === "GET" && req.url === "/api/task-board/summary") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, summary: { total: 0, columns: {} } }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/task-board") {
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, id: "task-001" }));
    return;
  }

  if (req.method === "PATCH" && req.url === "/api/task-board/task-001") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Failed to bind test server");
}
const upstreamBase = `http://127.0.0.1:${address.port}`;
process.env.DASHBOARD_API_BASE = "http://127.0.0.1:9";

try {
  const failedWithoutOverride = await getBoard(
    new Request("http://localhost:7001/api/task-board?limit=20", {
      method: "GET",
      headers: { authorization: "Bearer token-read" },
    }),
  );
  assert.equal(failedWithoutOverride.status, 502);
  const failedPayload = await failedWithoutOverride.json();
  assert.equal(failedPayload.error, "Upstream dashboard request failed");

  const readResponse = await getBoard(
    new Request("http://localhost:7001/api/task-board?limit=20", {
      method: "GET",
      headers: {
        authorization: "Bearer token-read",
        "x-dashboard-api-base": upstreamBase,
      },
    }),
  );
  assert.equal(readResponse.status, 200);

  const createResponse = await createTask(
    new Request("http://localhost:7001/api/task-board", {
      method: "POST",
      headers: {
        authorization: "Bearer token-write",
        cookie: "openclaw_dashboard_token=session-cookie",
        "content-type": "application/json",
        "x-dashboard-api-base": upstreamBase,
        "x-ventureos-binding-id": "operations:operator",
        "x-ventureos-capability-id": "venture_control",
      },
      body: JSON.stringify({ title: "Create from smoke" }),
    }),
  );
  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  assert.equal(createPayload.id, "task-001");

  const patchUnauthorized = await patchTask(
    new Request("http://localhost:7001/api/task-board/task-001", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-dashboard-api-base": upstreamBase,
      },
      body: JSON.stringify({ status: "running" }),
    }),
    { params: { taskId: "task-001" } },
  );
  assert.equal(patchUnauthorized.status, 401);

  const patchMissingSubject = await patchTask(
    new Request("http://localhost:7001/api/task-board/task-001", {
      method: "PATCH",
      headers: {
        authorization: "Bearer token-write",
        "content-type": "application/json",
        "x-dashboard-api-base": upstreamBase,
      },
      body: JSON.stringify({ status: "running" }),
    }),
    { params: { taskId: "task-001" } },
  );
  assert.equal(patchMissingSubject.status, 403);

  const patchResponse = await patchTask(
    new Request("http://localhost:7001/api/task-board/task-001", {
      method: "PATCH",
      headers: {
        authorization: "Bearer token-write",
        "content-type": "application/json",
        "x-dashboard-api-base": upstreamBase,
        "x-ventureos-binding-id": "operations:operator",
        "x-ventureos-capability-id": "venture_control",
      },
      body: JSON.stringify({ status: "running" }),
    }),
    { params: { taskId: "task-001" } },
  );
  assert.equal(patchResponse.status, 200);

  const invalidJsonResponse = await createTask(
    new Request("http://localhost:7001/api/task-board", {
      method: "POST",
      headers: {
        authorization: "Bearer token-write",
        "content-type": "application/json",
        "x-dashboard-api-base": upstreamBase,
        "x-ventureos-binding-id": "operations:operator",
        "x-ventureos-capability-id": "venture_control",
      },
      body: "{invalid",
    }),
  );
  assert.equal(invalidJsonResponse.status, 400);

  const createUpstream = upstreamRequests.find(
    (entry) => entry.method === "POST" && entry.url === "/api/task-board",
  );
  assert.ok(createUpstream, "expected upstream POST /api/task-board");
  assert.equal(createUpstream.headers.authorization, "Bearer token-write");
  assert.equal(
    createUpstream.headers.cookie,
    "openclaw_dashboard_token=session-cookie",
  );
  assert.equal(createUpstream.headers["x-ventureos-binding-id"], "operations:operator");
  assert.equal(createUpstream.headers["x-ventureos-capability-id"], "venture_control");

  const readUpstream = upstreamRequests.find(
    (entry) => entry.method === "GET" && entry.url === "/api/task-board?limit=20",
  );
  assert.ok(readUpstream, "expected upstream GET query passthrough");
  assert.equal(readUpstream.headers["x-dashboard-api-base"], undefined);

  console.log("DASHBOARD_NEXT_TASK_BOARD_WRITE_SMOKE_OK");
} finally {
  server.close();
}
