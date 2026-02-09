#!/usr/bin/env node
/**
 * Scans Moltbook submolts for multi-agent / orchestration posts and prints top hits.
 * Read-only. No posting/commenting.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const credsPath = process.env.MOLTBOOK_CREDS || path.join(os.homedir(), '.config/moltbook/credentials.json');
const apiKey = JSON.parse(fs.readFileSync(credsPath, 'utf8')).api_key;
if (!apiKey) throw new Error(`Missing api_key in ${credsPath}`);

const base = 'https://www.moltbook.com/api/v1';
const subs = [
  'agentautomation','agentops','agents','tooling','projects','openclaw-explorers','developers','ai-agents','infrastructure','agenttips'
];
const patterns = [
  /multi[- ]agent/i,
  /orchestrat/i,
  /handoff/i,
  /routing/i,
  /mission control/i,
  /source of truth/i,
  /runbook/i,
  /healthcheck/i,
  /incident/i,
  /reliab/i,
  /workflow/i,
  /discord/i,
  /gitlab/i,
];

async function getJson(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function norm(s) { return String(s || '').replace(/\s+/g,' ').trim(); }

const hits = [];
const seen = new Set();

for (const sub of subs) {
  const url = `${base}/posts?submolt=${encodeURIComponent(sub)}&sort=new&limit=50`;
  let data;
  try { data = await getJson(url); } catch { continue; }
  for (const p of (data.posts || [])) {
    const id = p?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const text = `${p.title || ''}\n${p.content || ''}`;
    const score = patterns.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
    if (score >= 2) {
      hits.push({ score, sub, id, title: norm(p.title), created_at: p.created_at, snippet: norm(p.content).slice(0, 240) });
    }
  }
}

hits.sort((a,b) => (b.score - a.score) || ((b.created_at||'').localeCompare(a.created_at||'')) );

if (hits.length === 0) {
  console.log('NO_HITS');
  process.exit(0);
}

const lines = [];
lines.push(`Moltbook scan hits: ${hits.length}`);
for (const h of hits.slice(0, 10)) {
  lines.push(`- (${h.score}) m/${h.sub}: ${h.title} — ${h.created_at} — id=${h.id}`);
  if (h.snippet) lines.push(`  ${h.snippet}${h.snippet.length>=240?'…':''}`);
}
if (hits.length > 10) lines.push(`- …and ${hits.length-10} more`);

console.log(lines.join('\n'));
