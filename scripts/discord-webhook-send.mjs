#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    out[name] = value;
    i += 1;
  }
  return out;
}

function resolvePath(input) {
  if (!input) return input;
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

const args = parseArgs(process.argv.slice(2));
const channel = args.channel;
const text = args.text;
const mapPath = resolvePath(
  args.map || process.env.DISCORD_WEBHOOK_MAP_PATH || "~/.openclaw/credentials/discord/webhooks.json",
);

if (!channel || !text) {
  console.error("Usage: discord-webhook-send.mjs --channel <channelId> --text <message> [--map <path>]");
  process.exit(2);
}

if (!fs.existsSync(mapPath)) {
  console.error(`Webhook map not found: ${mapPath}`);
  process.exit(2);
}

let map;
try {
  map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
} catch (err) {
  console.error(`Invalid webhook map JSON at ${mapPath}: ${err.message}`);
  process.exit(2);
}

const webhookUrl = map[channel];
if (!webhookUrl) {
  console.error(`No webhook URL configured for channel: ${channel}`);
  process.exit(2);
}

const resp = await fetch(webhookUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ content: text }),
});

if (!resp.ok) {
  const body = await resp.text().catch(() => "");
  console.error(`Webhook send failed (${resp.status}) ${body.slice(0, 200)}`);
  process.exit(1);
}

process.exit(0);
