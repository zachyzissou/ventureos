const { execFile } = require('child_process');

function sanitizeAgentId(agentId) {
  return String(agentId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function sanitizeInt(n, dflt = 0) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : dflt;
}

function sqliteLiteral(value) {
  // Note: these literals are for the sqlite3 *shell* `.parameter set` command,
  // not raw SQL. The shell parser does not reliably handle SQL-style escaping
  // (e.g. `''` inside single-quoted strings), so we prefer double-quoted values
  // for TEXT.
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;

  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (t === 'boolean') return value ? '1' : '0';

  const s = String(value);
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function normalizeParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (!k) continue;
    const name = /^[\$:@?]/.test(k) ? k : `$${k}`;
    out[name] = v;
  }
  return out;
}

/**
 * Run a SQL query via sqlite3 CLI and parse the JSON output.
 *
 * Supports parameter binding via sqlite3 shell `.parameter set`.
 *
 * Signatures:
 *   sqliteJson(dbPath, sql)
 *   sqliteJson(dbPath, sql, opts)
 *   sqliteJson(dbPath, sql, params)
 *   sqliteJson(dbPath, sql, params, opts)
 */
function sqliteJson(dbPath, sql, paramsOrOpts = {}, maybeOpts = {}) {
  let params = paramsOrOpts;
  let opts = maybeOpts;

  const looksLikeOpts = (o) => o && typeof o === 'object' && (
    Object.prototype.hasOwnProperty.call(o, 'attempts') ||
    Object.prototype.hasOwnProperty.call(o, 'timeoutMs') ||
    Object.prototype.hasOwnProperty.call(o, 'retryDelayMs')
  );

  if (looksLikeOpts(paramsOrOpts) && !looksLikeOpts(maybeOpts)) {
    opts = paramsOrOpts;
    params = {};
  }

  const {
    attempts = 3,
    timeoutMs = 2000,
    retryDelayMs = 120
  } = opts || {};

  const bound = normalizeParams(params);

  return new Promise((resolve, reject) => {
    const run = (attempt) => {
      const args = ['-cmd', `.timeout ${timeoutMs}`];

      const names = Object.keys(bound);
      if (names.length) {
        args.push('-cmd', '.parameter init');
        for (const name of names) {
          args.push('-cmd', `.parameter set ${name} ${sqliteLiteral(bound[name])}`);
        }
      }

      args.push('-json', dbPath, sql);

      execFile('sqlite3', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const msg = `${err.message} ${stderr || ''}`;
          const locked = /database is locked|database is busy|locked\s*\(5\)/i.test(msg);
          if (locked && attempt < attempts) {
            return setTimeout(() => run(attempt + 1), retryDelayMs * attempt);
          }
          const e = new Error(`sqlite3 failed: ${err.message}`);
          e.stderr = stderr;
          e.sql = sql;
          e.params = bound;
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
          ex.params = bound;
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
