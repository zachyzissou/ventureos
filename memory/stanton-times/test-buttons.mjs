#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const draft = `⚡ ALPHA 4.6 GOES LIVE — LEVSKI IN CRISIS

Levski faces an unprecedented emergency. Contaminated air systems have triggered a fungal outbreak.

The Clearing the Air event is now active — Citizens needed.

#StarCitizen`;

const payload = {
  username: 'The Stanton Times',
  avatar_url: 'https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg',
  content: '<@956203522624462918>',
  embeds: [{
    title: '🚨 BREAKING NEWS — Draft Ready',
    color: 0xED4245,
    fields: [
      { name: '📌 Source', value: 'RSI Devtracker', inline: true },
      { name: '📌 Topic', value: 'Alpha 4.6 LIVE', inline: true },
      { name: '📌 Priority', value: 'P0 — IMMEDIATE', inline: true },
      { name: 'Our Draft', value: '```\n' + draft + '\n```' }
    ],
    footer: { text: 'Click a button below to approve, reject, or edit' },
    timestamp: new Date().toISOString()
  }],
  components: [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: 'Approve', custom_id: 'approve_tweet', emoji: { name: '✅' } },
        { type: 2, style: 4, label: 'Reject', custom_id: 'reject_tweet', emoji: { name: '❌' } },
        { type: 2, style: 2, label: 'Edit', custom_id: 'edit_tweet', emoji: { name: '📝' } }
      ]
    }
  ]
};

try {
  const res = await fetch(env.STANTON_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
} catch (err) {
  console.error('Error:', err.message);
}
