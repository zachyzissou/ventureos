import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import {
  normalizeLogEntriesPayload,
  normalizeLogSourcesPayload,
} from "../lib/logs.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "logs.sample.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const sources = normalizeLogSourcesPayload(fixture.sourcesPayload);
const entries = normalizeLogEntriesPayload(fixture.entriesPayload);

assert.equal(sources.sources.length, 2);
assert.equal(sources.sources[0]?.id, "dashboard-server");
assert.equal(sources.sources[1]?.format, "jsonl");

assert.equal(entries.source, "dashboard-server");
assert.equal(entries.total, 2);
assert.equal(entries.entries.length, 2);
assert.equal(entries.entries[1]?.level, "warn");
assert.equal(
  entries.entries[1]?.message,
  "Overview freshness stale state reported",
);

console.log("DASHBOARD_NEXT_LOGS_PARITY_OK");
