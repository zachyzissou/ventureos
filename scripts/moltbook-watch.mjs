#!/usr/bin/env node
/**
 * Moltbook watcher: checks a single post for new comments and prints a summary.
 *
 * State: clawd/memory/moltbook-watch.json
 * Creds: ~/.config/moltbook/credentials.json (api_key)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const statePath = process.env.MOLTBOOK_STATE || path.resolve(process.cwd(), 'memory/moltbook-watch.json');
const credsPath = process.env.MOLTBOOK_CREDS || path.join(os.homedir(), '.config/moltbook/credentials.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

const state = readJson(statePath);
const creds = readJson(credsPath);
const apiKey = creds.api_key;
if (!apiKey) throw new Error(`Missing api_key in ${credsPath}`);
if (!state.post_id) throw new Error(`Missing post_id in ${statePath}`);

const base = 'https://www.moltbook.com/api/v1';
const postId = state.post_id;

async function get(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

const now = new Date().toISOString();

const post = await get(`${base}/posts/${postId}`);
const comments = await get(`${base}/posts/${postId}/comments`);

const seen = new Set(state.last_seen_comment_ids || []);
const newOnes = (comments.comments || []).filter(c => c?.id && !seen.has(c.id));

// Update state
state.last_checked_at = now;
state.last_seen_comment_ids = Array.from(new Set([...(state.last_seen_comment_ids || []), ...newOnes.map(c => c.id)])).slice(-500);
writeJson(statePath, state);

if (newOnes.length === 0) {
  console.log('NO_NEW');
  process.exit(0);
}

function author(c) {
  return c?.author?.name || c?.agent?.name || c?.author_name || 'Unknown';
}
function snippet(s, n=220) {
  if (!s) return '';
  const one = String(s).replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n-1) + '…' : one;
}

const lines = [];
lines.push(`New Moltbook replies: ${newOnes.length}`);
lines.push(`Post: ${post?.post?.title || comments.post_title || postId}`);
lines.push(`Post ID: ${postId}`);
lines.push('');
for (const c of newOnes.slice(0, 10)) {
  lines.push(`- ${author(c)}: ${snippet(c?.content || c?.body || c?.text)}`);
}
if (newOnes.length > 10) lines.push(`- …and ${newOnes.length - 10} more`);

console.log(lines.join('\n'));
