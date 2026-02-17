/**
 * SQLite Conversation Store — VentureOS Conversation Persistence
 *
 * Implements the ConversationStore interface using the RPG SQLite database
 * tables (conversations, conversation_messages, conversation_participants,
 * conversation_turn_state). This ensures that dashboard APIs backed by
 * the ConversationEngine return real persisted data.
 *
 * Fixes #182 — Make Conversations API produce real persisted data for dashboard
 */

import Database from 'better-sqlite3';
import type {
  ConversationStore,
  ConversationState,
  ConversationMessage,
  ConversationId,
} from './conversation-engine';

/**
 * SQLite-backed conversation store that reads/writes to the RPG database.
 *
 * The SQLite tables have a normalized schema (conversations, conversation_messages,
 * conversation_participants, conversation_turn_state). This store translates between
 * the ConversationEngine's in-memory ConversationState and the relational schema.
 */
export class SqliteConversationStore implements ConversationStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: false });
    this.db.pragma('journal_mode = WAL');
    this.ensureTables();
  }

  /**
   * Create tables if they don't exist. Safe for both fresh and existing DBs.
   * The schema matches what the existing dashboard code expects.
   */
  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT DEFAULT '{}'
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

      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (conversation_id, agent),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      CREATE TABLE IF NOT EXISTS conversation_turn_state (
        conversation_id TEXT PRIMARY KEY,
        current_speaker TEXT,
        queue TEXT DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
    `);
  }

  async load(conversationId: ConversationId): Promise<ConversationState | null> {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any;
    if (!row) return null;

    const messages = this.db
      .prepare('SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY timestamp ASC')
      .all(conversationId) as any[];

    const participants = this.db
      .prepare('SELECT * FROM conversation_participants WHERE conversation_id = ?')
      .all(conversationId) as any[];

    const turnState = this.db
      .prepare('SELECT * FROM conversation_turn_state WHERE conversation_id = ?')
      .get(conversationId) as any;

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata || '{}');
    } catch { /* ignore parse errors */ }

    const participantIds = participants.map((p: any) => p.agent);
    const currentTurn = turnState?.current_speaker ?? participantIds[0] ?? '';

    // Reconstruct ConversationMessage[] from normalized rows
    const convMessages: ConversationMessage[] = messages.map((m: any) => {
      let violations: string[] = [];
      try { violations = JSON.parse(m.violations || '[]'); } catch { /* ignore */ }
      let msgMeta: Record<string, unknown> = {};
      try { msgMeta = JSON.parse(m.metadata || '{}'); } catch { /* ignore */ }

      return {
        messageId: m.id,
        conversationId,
        from: m.agent,
        to: msgMeta._to ? (Array.isArray(msgMeta._to) ? msgMeta._to : [msgMeta._to]) : [],
        deliveredTo: msgMeta._deliveredTo ? (Array.isArray(msgMeta._deliveredTo) ? msgMeta._deliveredTo : [msgMeta._deliveredTo]) : [],
        content: m.text,
        createdAt: m.timestamp,
        payload: msgMeta._payload as any,
        status: (msgMeta._status as any) ?? 'delivered',
        blockedReason: msgMeta._blockedReason as string | undefined,
        security: msgMeta._security as any,
        handoff: msgMeta._handoff as any,
        mediation: msgMeta._mediation as any,
      };
    });

    const state: ConversationState = {
      conversationId: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status as any,
      statusReason: metadata._statusReason as string | undefined,
      participants: participantIds,
      currentTurn,
      tokenBudget: (metadata._tokenBudget as number) ?? 10_000,
      tokensUsed: (metadata._tokensUsed as number) ?? 0,
      messageCount: convMessages.length,
      challengeCount: (metadata._challengeCount as number) ?? 0,
      consecutiveChallenges: (metadata._consecutiveChallenges as number) ?? 0,
      injectionScores: (metadata._injectionScores as number[]) ?? [],
      policyViolationCount: (metadata._policyViolationCount as number) ?? 0,
      voiceRuleViolationCount: (metadata._voiceRuleViolationCount as number) ?? 0,
      affinity: (metadata._affinity as any) ?? {
        averageAffinity: 0.5,
        lowestAffinity: 0.5,
        lowestAffinityPair: ['', ''],
      },
      summaries: (metadata._summaries as any[]) ?? [],
      messages: convMessages,
      metadata,
    };

    return state;
  }

  async save(state: ConversationState): Promise<void> {
    const saveTransaction = this.db.transaction(() => {
      // Build metadata with engine-specific fields
      const metadata: Record<string, unknown> = {
        ...(state.metadata ?? {}),
        _statusReason: state.statusReason,
        _tokenBudget: state.tokenBudget,
        _tokensUsed: state.tokensUsed,
        _challengeCount: state.challengeCount,
        _consecutiveChallenges: state.consecutiveChallenges,
        _injectionScores: state.injectionScores,
        _policyViolationCount: state.policyViolationCount,
        _voiceRuleViolationCount: state.voiceRuleViolationCount,
        _affinity: state.affinity,
        _summaries: state.summaries,
      };

      // Derive a title from metadata or conversation ID
      const title = (state.metadata?.title as string)
        ?? (state.metadata?.topic as string)
        ?? `Conversation ${state.conversationId.slice(0, 12)}`;

      // Upsert conversation
      this.db.prepare(`
        INSERT INTO conversations (id, title, status, created_at, updated_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          updated_at = excluded.updated_at,
          metadata = excluded.metadata
      `).run(
        state.conversationId,
        title,
        state.status,
        state.createdAt,
        state.updatedAt,
        JSON.stringify(metadata),
      );

      // Upsert participants
      const upsertParticipant = this.db.prepare(`
        INSERT INTO conversation_participants (conversation_id, agent, status, joined_at, last_active)
        VALUES (?, ?, 'active', datetime('now'), datetime('now'))
        ON CONFLICT(conversation_id, agent) DO UPDATE SET
          last_active = datetime('now')
      `);
      for (const agent of state.participants) {
        upsertParticipant.run(state.conversationId, agent);
      }

      // Upsert turn state
      let turnQueue: string[] = [];
      try {
        // Remaining participants after current turn
        const idx = state.participants.indexOf(state.currentTurn);
        if (idx >= 0) {
          turnQueue = [...state.participants.slice(idx + 1), ...state.participants.slice(0, idx)];
        }
      } catch { /* ignore */ }

      this.db.prepare(`
        INSERT INTO conversation_turn_state (conversation_id, current_speaker, queue, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(conversation_id) DO UPDATE SET
          current_speaker = excluded.current_speaker,
          queue = excluded.queue,
          updated_at = datetime('now')
      `).run(state.conversationId, state.currentTurn, JSON.stringify(turnQueue));

      // Upsert messages (only new ones — check by ID)
      const upsertMessage = this.db.prepare(`
        INSERT OR IGNORE INTO conversation_messages
          (id, conversation_id, agent, type, text, timestamp, injection_score, violations, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const msg of state.messages) {
        const msgMeta: Record<string, unknown> = {
          _to: msg.to,
          _deliveredTo: msg.deliveredTo,
          _payload: msg.payload,
          _status: msg.status,
          _blockedReason: msg.blockedReason,
          _security: msg.security,
          _handoff: msg.handoff,
          _mediation: msg.mediation,
        };

        const violations: string[] = [];
        if (msg.security) {
          if (msg.security.policyWarningCount > 0) violations.push('policy');
          if (msg.security.voiceViolationCount > 0) violations.push('voice');
          if (msg.security.injectionScore > 0.6) violations.push('injection');
        }

        upsertMessage.run(
          msg.messageId,
          state.conversationId,
          msg.from,
          msg.payload?.type ?? 'fact',
          msg.content,
          msg.createdAt,
          msg.security?.injectionScore ?? 0,
          JSON.stringify(violations),
          JSON.stringify(msgMeta),
        );
      }
    });

    saveTransaction();
  }

  async list(): Promise<ConversationId[]> {
    const rows = this.db
      .prepare('SELECT id FROM conversations ORDER BY updated_at DESC')
      .all() as any[];
    return rows.map((r: any) => r.id);
  }

  /** Close the database connection. */
  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore close errors
    }
  }
}

export default SqliteConversationStore;
