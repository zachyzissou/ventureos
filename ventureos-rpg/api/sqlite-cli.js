const { execFile } = require('child_process');

function sanitizeAgentId(agentId) {
  return String(agentId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function sanitizeInt(n, dflt = 0) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : dflt;
}

function sqliteJson(dbPath, sql, { attempts = 3, timeoutMs = 2000, retryDelayMs = 120 } = {}) {
  return new Promise((resolve, reject) => {
    // Prefer system sqlite3; works on macOS with -json.
    const run = (attempt) => {
      execFile('sqlite3', ['-cmd', `.timeout ${timeoutMs}`, '-json', dbPath, sql], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const msg = `${err.message} ${stderr || ''}`;
          const locked = /database is locked|database is busy|locked\s*\(5\)/i.test(msg);
          if (locked && attempt < attempts) {
            return setTimeout(() => run(attempt + 1), retryDelayMs * attempt);
          }
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
    };
    run(1);
  });
}

module.exports = {
  sqliteJson,
  sanitizeAgentId,
  sanitizeInt
};
