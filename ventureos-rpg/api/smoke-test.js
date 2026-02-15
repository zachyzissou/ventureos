const assert = require('assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { sqliteJson } = require('./sqlite-cli');

const base = process.env.RPG_BASE_URL || 'http://127.0.0.1:7001';

async function check(pathname) {
  const url = base + pathname;
  const res = await fetch(url);
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}\n${txt.slice(0, 400)}`);
  }
  return json;
}

async function sqlInjectionSelfTest() {
  const dbPath = path.join(os.tmpdir(), `ventureos-rpg-sqlinj-${process.pid}-${Date.now()}.db`);

  try {
    execFileSync('sqlite3', [
      dbPath,
      [
        'PRAGMA journal_mode=WAL;',
        'CREATE TABLE users(name TEXT);',
        "INSERT INTO users(name) VALUES ('alice'), ('bob');"
      ].join('\n')
    ], { stdio: 'ignore' });

    const ok = await sqliteJson(dbPath, 'SELECT name FROM users WHERE name = $name;', { name: 'alice' });
    assert.equal(ok.length, 1);
    assert.equal(ok[0].name, 'alice');

    // If the query is not parameterized, this input would typically turn the WHERE
    // clause into a tautology and return both rows.
    const injection = "alice' OR 1=1 --";
    const attacked = await sqliteJson(dbPath, 'SELECT name FROM users WHERE name = $name;', { name: injection });
    assert.equal(attacked.length, 0);

    console.log('sql injection self-test ok');
  } finally {
    try { fs.rmSync(dbPath, { force: true }); } catch {}
  }
}

(async () => {
  await sqlInjectionSelfTest();

  const stats = await check('/api/rpg/stats');
  console.log('stats ok; agents:', stats.agents?.length);

  const oracle = await check('/api/rpg/tactical-overlay/oracle');
  console.log('oracle overlay ok; unit:', oracle.unit);

  const net = await check('/api/rpg/khala-network?driftLimit=3');
  console.log('khala ok; nodes:', net.nodes?.length, 'edges:', net.edges?.length);

  const prot = await check('/api/rpg/protocols/sentinel');
  console.log('protocols ok; count:', prot.protocols?.length);

  const esc = await check('/api/rpg/escalations/sentinel');
  console.log('escalations ok; ratio:', esc.escalation_quality?.signal_ratio);

  console.log('SMOKE TEST PASS');
})().catch((e) => {
  console.error('SMOKE TEST FAIL:', e);
  process.exitCode = 1;
});
