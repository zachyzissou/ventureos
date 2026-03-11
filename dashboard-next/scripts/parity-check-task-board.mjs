import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import {
  allowedTransitions,
  normalizeTaskBoardPayload,
} from "../lib/task-board.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "task-board.sample.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const normalized = normalizeTaskBoardPayload(
  fixture.listPayload,
  fixture.summaryPayload,
);

assert.equal(normalized.total, 3);
assert.equal(normalized.tasks.length, 3);
assert.equal(normalized.tasks[0]?.id, "task-001");
assert.equal(normalized.tasks[1]?.status, "running");
assert.equal(normalized.tasks[2]?.priority, "low");

assert.equal(normalized.summary.total, 3);
assert.equal(normalized.summary.columns.queued, 1);
assert.equal(normalized.summary.columns.running, 1);
assert.equal(normalized.summary.columns.done, 1);

const queuedTransitions = allowedTransitions("queued");
assert.deepEqual(queuedTransitions, ["running", "blocked", "backlog", "done"]);

const doneTransitions = allowedTransitions("done");
assert.deepEqual(doneTransitions, ["backlog"]);

console.log("DASHBOARD_NEXT_TASK_BOARD_PARITY_OK");
