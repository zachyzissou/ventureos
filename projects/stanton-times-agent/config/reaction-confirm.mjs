#!/usr/bin/env node
/**
 * Reaction Confirmation Embed Sender
 * Sends beautiful Discord webhook embeds when reactions are received
 * 
 * Usage: node reaction-confirm.mjs <emoji> <user> <msgId> [context]
 * Example: node reaction-confirm.mjs "✅" "zap" "1234567890" "Draft: Weather alert post"
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const WEBHOOK_URL = env.STANTON_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.error('Error: STANTON_WEBHOOK_URL not set in .env');
  process.exit(1);
}

const [,, emoji, user, msgId, context] = process.argv;

if (!emoji || !user || !msgId) {
  console.error('Usage: node reaction-confirm.mjs <emoji> <user> <msgId> [context]');
  process.exit(1);
}

// Reaction type configurations
const reactionTypes = {
  '✅': {
    title: '✅ Approved',
    color: 0x57F287, // Green
    action: 'Proceeding with action',
    footer: 'Action will be executed'
  },
  '❌': {
    title: '❌ Rejected',
    color: 0xED4245, // Red
    action: 'Action cancelled',
    footer: 'Item has been discarded'
  },
  '🤔': {
    title: '🤔 Held for Review',
    color: 0xFEE75C, // Yellow
    action: 'Awaiting further input',
    footer: 'React again when ready'
  }
};

const config = reactionTypes[emoji] || {
  title: `${emoji} Reaction Received`,
  color: 0x5865F2, // Discord Blurple
  action: 'Noted',
  footer: 'Reaction logged'
};

const embed = {
  title: config.title,
  color: config.color,
  fields: [
    {
      name: 'By',
      value: `**${user}**`,
      inline: true
    },
    {
      name: 'Message',
      value: `\`${msgId}\``,
      inline: true
    },
    {
      name: 'Status',
      value: config.action,
      inline: false
    }
  ],
  footer: {
    text: config.footer
  },
  timestamp: new Date().toISOString()
};

// Add context if provided
if (context) {
  embed.description = `> ${context}`;
}

const payload = {
  username: 'The Stanton Times',
  avatar_url: 'https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg',
  embeds: [embed]
};

try {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const text = await res.text();
    console.error(`Webhook failed: ${res.status} ${text}`);
    process.exit(1);
  }
  
  console.log(`✓ Confirmation sent: ${config.title} by ${user}`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
