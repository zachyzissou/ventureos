import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { normalizeOverviewPayload } from "../lib/overview.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "overview.sample.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const normalized = normalizeOverviewPayload(fixture);

assert.equal(normalized.health.ok, true);
assert.equal(normalized.health.service, "ventureos-dashboard");
assert.equal(normalized.services.total, 3);
assert.equal(normalized.services.active, 2);
assert.equal(normalized.services.inactive, 1);
assert.equal(normalized.system.cpuUsage, 13.2);
assert.equal(normalized.system.diskPercent, 52.5);
assert.equal(normalized.system.load1m, "2.10");
assert.equal(normalized.system.crashCount, 4);

console.log("DASHBOARD_NEXT_OVERVIEW_PARITY_OK");
