const { execFile } = require('child_process');

function sanitizeAgentId(agentId) {
  return String(agentId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function sanitizeInt(n, dflt = 0) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : dflt;
}

function sqliteJson(dbPath, sql) {
  return new Promise((resolve, reject) => {
    // Prefer system sqlite3; works on macOS with -json.
    execFile('sqlite3', ['-json', dbPath, sql], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(`sqlite3 failed: ${err.message}`);
        e.stderr = stderr;
        e.sql = sql;
        return reject(e);
      }
      const out = String(stdout || '').trim();
      if (!out) return resolve([]);
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        const ex = new Error(`sqlite3 JSON parse failed: ${e.message}`);
        ex.stdout = out;
        ex.stderr = stderr;
        ex.sql = sql;
        reject(ex);
      }
    });
  });
}

module.exports = {
  sqliteJson,
  sanitizeAgentId,
  sanitizeInt
};
