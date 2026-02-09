#!/usr/bin/env node
/**
 * Send a message to a Discord channel via webhook.
 *
 * Usage:
 *   node scripts/discord-webhook-send.mjs --channel <channelId> --text "hello"
 *   node scripts/discord-webhook-send.mjs --channel <channelId> --title "T" --description "D" [--color "#RRGGBB"]
 *
 * Webhook URLs are stored in:
 *   ~/.openclaw/credentials/discord/webhooks.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function die(msg, code = 1) {
  process.stderr.write(msg + "\n");
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v == null || v.startsWith("--")) {
      args[k] = true;
    } else {
      args[k] = v;
      i++;
    }
  }
  return args;
}

function hexColorToInt(hex) {
  if (!hex) return undefined;
  const m = String(hex).trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) die(`Invalid --color: ${hex} (expected #RRGGBB)`);
  return parseInt(m[1], 16);
}

async function main() {
  const args = parseArgs(process.argv);

  const channelId = args.channel;
  if (!channelId) die("Missing --channel <channelId>");

  const credsPath = path.join(os.homedir(), ".openclaw", "credentials", "discord", "webhooks.json");
  if (!fs.existsSync(credsPath)) die(`Missing webhook map: ${credsPath}`);

  const map = JSON.parse(fs.readFileSync(credsPath, "utf8"));
  const webhookUrl = map[String(channelId)];
  if (!webhookUrl) die(`No webhook configured for channel ${channelId}`);

  const text = args.text;
  const title = args.title;
  const description = args.description;

  if (!text && !title && !description) {
    die("Provide either --text or (--title and/or --description)");
  }

  /** @type {any} */
  const payload = {};

  if (text) {
    payload.content = text;
  }

  if (title || description) {
    payload.embeds = [
      {
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(args.color ? { color: hexColorToInt(args.color) } : {}),
      },
    ];
  }

  // Use wait=true so Discord responds with message object (useful for debugging)
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    die(`Webhook POST failed (${res.status}): ${bodyText}`);
  }

  process.stdout.write(bodyText + "\n");
}

main().catch((err) => die(err?.stack || String(err)));
