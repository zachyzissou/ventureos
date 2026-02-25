import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { normalizeReadinessPayload } from "../lib/readiness.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturePath = path.join(
  __dirname,
  "..",
  "fixtures",
  "openclaw-local-readiness.sample.json",
);

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const normalized = normalizeReadinessPayload(fixture);

assert.equal(normalized.ok, true);
assert.equal(normalized.available, true);
assert.equal(normalized.latest?.summary.verdict, "blocked");
assert.equal(normalized.latest?.summary.readinessScore, 45);
assert.equal(normalized.latest?.checksByGroup[1]?.id, "core");
assert.equal(normalized.latest?.checksByGroup[1]?.fail, 1);
assert.equal(
  normalized.latest?.blockers[0]?.id,
  "openclaw-gateway-status",
);
assert.equal(normalized.latest?.blockers[0]?.owner, "Platform Ops");

console.log("DASHBOARD_NEXT_READINESS_PARITY_OK");
