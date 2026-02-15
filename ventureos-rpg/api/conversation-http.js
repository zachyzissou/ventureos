/**
 * Conversation HTTP API for VentureOS RPG Phase 4
 * 
 * Routes:
 *   GET  /api/rpg/conversations/active      — list active conversations
 *   GET  /api/rpg/conversations/:id          — get conversation detail (messages, participants, affinities)
 *   POST /api/rpg/conversations              — create a new conversation
 *   POST /api/rpg/conversations/:id/messages — add message to conversation
 *   GET  /api/rpg/conversations/:id/messages — paginated message history
 * 
 * All data stored in the ventureos-rpg.db SQLite database.
 */

const path = require('path');
const os = require('os');

const DEFAULT_DB = path.join(os.homedir(), 'clawd', 'agents', 'ventureos-rpg.db');

// Lazy-init SQLite (reuse existing pattern from rpg-service)
let _db = null;
function getDb(dbPath) {
  if (_db && _db._path === dbPath) return _db;
  try {
    let Database;
    try { Database = require('better-sqlite3'); } catch {
      // Fallback: try ventureos's copy
      Database = require(path.join(os.homedir(), 'clawd', 'ventureos', 'node_modules', 'better-sqlite3'));
    }
    _db = new Database(dbPath);
    _db._path = dbPath;
    _db.pragma('journal_mode = WAL');
    ensureSchema(_db);
    return _db;
  } catch (e) {
    console.error('[conversation-http] SQLite init failed:', e.message);
    return null;
  }
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (conversation_id, agent),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      type TEXT DEFAULT 'fact',
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      injection_score REAL DEFAULT 0,
      violations TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS conversation_turn_state (
      conversation_id TEXT PRIMARY KEY,
      current_speaker TEXT,
      queue TEXT DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status);
  `);
}

function sendJson(res, data, status = 200) {
  // Phase 5.1: Removed wildcard CORS — handled by dashboard server middleware
  res.writeHead(status, {
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function generateId(prefix = 'conv') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Fetch affinities for participants in a conversation from the khala_bonds table
function getAffinities(db, agents) {
  try {
    const pairs = [];
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const [a, b] = [agents[i], agents[j]].sort();
        // Try khala_network (Phase 3 schema) then khala_bonds as fallback
        let row;
        try {
          row = db.prepare(
            `SELECT agent_a, agent_b, affinity FROM khala_network WHERE agent_a = ? AND agent_b = ?`
          ).get(a, b);
        } catch {
          try {
            row = db.prepare(
              `SELECT agent_a, agent_b, affinity FROM khala_bonds WHERE agent_a = ? AND agent_b = ?`
            ).get(a, b);
          } catch { /* neither table exists */ }
        }
        if (row) {
          pairs.push({ a: row.agent_a, b: row.agent_b, value: row.affinity });
        }
      }
    }
    // Sort by affinity descending
    pairs.sort((x, y) => y.value - x.value);
    return pairs;
  } catch {
    return [];
  }
}

function handleConversationApi(req, res, { dbPath = DEFAULT_DB } = {}) {
  if (!req.url) return false;
  if (!req.url.startsWith('/api/rpg/conversations')) return false;

  if (req.method === 'OPTIONS') {
    sendJson(res, {}, 204);
    return true;
  }

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean); // [api, rpg, conversations, ...]

  // Defensive: must be at least [api, rpg, conversations]
  if (parts.length < 3) return false;

  const db = getDb(dbPath);
  
  // If no database, return demo data
  if (!db) {
    return handleDemoFallback(req, res, url, parts);
  }

  (async () => {
    try {
      const route = parts.slice(3); // after api/rpg/conversations

      // GET /api/rpg/conversations/active
      if (req.method === 'GET' && route.length === 1 && route[0] === 'active') {
        const convs = db.prepare(
          `SELECT id, title, status, created_at, updated_at FROM conversations WHERE status = 'active' ORDER BY updated_at DESC LIMIT 20`
        ).all();
        return sendJson(res, { ok: true, conversations: convs });
      }

      // POST /api/rpg/conversations — create new conversation
      if (req.method === 'POST' && route.length === 0) {
        const body = await readBody(req);
        const id = body.id || generateId();
        const title = body.title || 'Untitled Conversation';
        const participants = body.participants || [];

        db.prepare(
          `INSERT OR REPLACE INTO conversations (id, title, status) VALUES (?, ?, 'active')`
        ).run(id, title);

        for (const agent of participants) {
          db.prepare(
            `INSERT OR REPLACE INTO conversation_participants (conversation_id, agent, status) VALUES (?, ?, 'active')`
          ).run(id, agent);
        }

        db.prepare(
          `INSERT OR REPLACE INTO conversation_turn_state (conversation_id, queue) VALUES (?, ?)`
        ).run(id, JSON.stringify(participants));

        return sendJson(res, { ok: true, id, title });
      }

      // GET /api/rpg/conversations/:id
      if (req.method === 'GET' && route.length === 1 && route[0] !== 'active') {
        const convId = route[0];
        const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(convId);
        if (!conv) return sendJson(res, { ok: false, error: 'Not found' }, 404);

        const participants = db.prepare(
          `SELECT agent, status, last_active FROM conversation_participants WHERE conversation_id = ? ORDER BY joined_at`
        ).all(convId);

        const messages = db.prepare(
          `SELECT id, agent, type, text, timestamp, injection_score, violations FROM conversation_messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 200`
        ).all(convId);

        // Parse violations JSON
        for (const m of messages) {
          try { m.violations = JSON.parse(m.violations || '[]'); } catch { m.violations = []; }
          m.injectionScore = m.injection_score;
          delete m.injection_score;
        }

        const turnState = db.prepare(
          `SELECT current_speaker, queue FROM conversation_turn_state WHERE conversation_id = ?`
        ).get(convId);

        const agentIds = participants.map(p => p.agent);
        const affinities = getAffinities(db, agentIds);

        return sendJson(res, {
          ok: true,
          conversation: {
            id: conv.id,
            title: conv.title,
            status: conv.status,
            participants,
            messages,
            currentSpeaker: turnState?.current_speaker || null,
            queue: turnState ? JSON.parse(turnState.queue || '[]') : [],
            affinities,
          },
        });
      }

      // POST /api/rpg/conversations/:id/messages — add message
      if (req.method === 'POST' && route.length === 2 && route[1] === 'messages') {
        const convId = route[0];
        const body = await readBody(req);
        const msgId = body.id || generateId('msg');

        db.prepare(
          `INSERT INTO conversation_messages (id, conversation_id, agent, type, text, injection_score, violations)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          msgId, convId, body.agent, body.type || 'fact', body.text,
          body.injectionScore || 0, JSON.stringify(body.violations || [])
        );

        // Update participant last_active
        db.prepare(
          `UPDATE conversation_participants SET last_active = datetime('now'), status = 'active' WHERE conversation_id = ? AND agent = ?`
        ).run(convId, body.agent);

        // Update conversation timestamp
        db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(convId);

        return sendJson(res, { ok: true, id: msgId });
      }

      // GET /api/rpg/conversations/:id/messages — paginated
      if (req.method === 'GET' && route.length === 2 && route[1] === 'messages') {
        const convId = route[0];
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
        const before = url.searchParams.get('before');

        let query = `SELECT id, agent, type, text, timestamp, injection_score, violations FROM conversation_messages WHERE conversation_id = ?`;
        const params = [convId];
        if (before) {
          query += ` AND timestamp < ?`;
          params.push(before);
        }
        query += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        const messages = db.prepare(query).all(...params).reverse();
        for (const m of messages) {
          try { m.violations = JSON.parse(m.violations || '[]'); } catch { m.violations = []; }
          m.injectionScore = m.injection_score;
          delete m.injection_score;
        }

        return sendJson(res, { ok: true, messages });
      }

      // PUT /api/rpg/conversations/:id/turn — update turn state
      if (req.method === 'PUT' && route.length === 2 && route[1] === 'turn') {
        const convId = route[0];
        const body = await readBody(req);
        db.prepare(
          `INSERT OR REPLACE INTO conversation_turn_state (conversation_id, current_speaker, queue, updated_at)
           VALUES (?, ?, ?, datetime('now'))`
        ).run(convId, body.currentSpeaker || null, JSON.stringify(body.queue || []));

        return sendJson(res, { ok: true });
      }

      // PUT /api/rpg/conversations/:id/participants/:agent — update participant status
      if (req.method === 'PUT' && route.length === 3 && route[1] === 'participants') {
        const convId = route[0];
        const agent = route[2];
        const body = await readBody(req);
        db.prepare(
          `UPDATE conversation_participants SET status = ?, last_active = datetime('now') WHERE conversation_id = ? AND agent = ?`
        ).run(body.status || 'active', convId, agent);

        return sendJson(res, { ok: true });
      }

      sendJson(res, { ok: false, error: 'Not found' }, 404);
    } catch (e) {
      console.error('[conversation-http] Error:', e.message);
      sendJson(res, { ok: false, error: e.message }, 500);
    }
  })();

  return true;
}

// Fallback demo data when database isn't available
function handleDemoFallback(req, res, url, parts) {
  const route = parts.slice(3);

  if (req.method === 'GET' && route.length === 1 && route[0] === 'active') {
    return sendJson(res, {
      ok: true,
      conversations: [{
        id: 'demo-001',
        title: 'Phase 4 Track 5 Coordination',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    }), true;
  }

  // For any other route, return demo data
  sendJson(res, { ok: true, conversation: null, _demo: true });
  return true;
}

module.exports = { handleConversationApi };
