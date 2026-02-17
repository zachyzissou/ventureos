/**
 * Interaction Logger — VentureOS RPG Database Writer
 *
 * Writes real agent interaction events to the interaction_logs table
 * in the RPG SQLite database. Designed to be wired into the
 * ConversationEngine/ConversationAPI event flow so that agent handoffs
 * produce observable, queryable data for the dashboard.
 *
 * Fixes #181 — Wire real interaction logging into agent handoffs
 */

import Database from 'better-sqlite3';

export interface InteractionLogParams {
  initiatorAgent: string;
  recipientAgent: string;
  interactionType: string;
  outcome: string;
  missionId?: string;
  sessionId?: string;
  description?: string;
}

export interface InteractionLoggerStats {
  totalLogged: number;
  lastWriteAt: string | null;
  dbPath: string;
}

export class InteractionLogger {
  private db: Database.Database | null = null;
  private totalLogged = 0;
  private lastWriteAt: string | null = null;
  private insertStmt: Database.Statement | null = null;

  constructor(private readonly dbPath: string) {}

  /**
   * Open the database connection (lazy — called on first write).
   * Creates the interaction_logs table if it doesn't exist (safe for
   * fresh databases).
   */
  private ensureDb(): Database.Database {
    if (this.db) return this.db;

    this.db = new Database(this.dbPath, { readonly: false });
    this.db.pragma('journal_mode = WAL');

    // Ensure the table exists with the schema the rest of the codebase expects.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS interaction_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiator_agent TEXT NOT NULL,
        recipient_agent TEXT NOT NULL,
        interaction_type TEXT NOT NULL,
        outcome TEXT NOT NULL,
        mission_id TEXT,
        session_id TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.insertStmt = this.db.prepare(`
      INSERT INTO interaction_logs
        (initiator_agent, recipient_agent, interaction_type, outcome,
         mission_id, session_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return this.db;
  }

  /**
   * Log a single interaction event.
   *
   * This is the primary write path that Issue #181 adds.
   * Called from ConversationAPI event listeners when a message
   * is successfully delivered between agents.
   */
  logInteraction(params: InteractionLogParams): void {
    this.ensureDb();

    this.insertStmt!.run(
      params.initiatorAgent,
      params.recipientAgent,
      params.interactionType,
      params.outcome,
      params.missionId ?? null,
      params.sessionId ?? null,
      params.description ?? null,
    );

    this.totalLogged += 1;
    this.lastWriteAt = new Date().toISOString();
  }

  /**
   * Log a handoff event derived from a ConversationMessage.
   *
   * Convenience wrapper that maps conversation-engine message fields
   * to interaction_logs columns.
   */
  logHandoff(opts: {
    from: string;
    to: string | string[];
    type: string;
    outcome: 'success' | 'blocked' | 'rejected';
    conversationId?: string;
    description?: string;
  }): void {
    const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
    for (const recipient of recipients) {
      if (!recipient || recipient === 'broadcast') continue;
      this.logInteraction({
        initiatorAgent: opts.from,
        recipientAgent: recipient,
        interactionType: opts.type,
        outcome: opts.outcome,
        sessionId: opts.conversationId ?? undefined,
        description: opts.description ?? undefined,
      });
    }
  }

  /** Observability: return current stats without requiring DB query. */
  getStats(): InteractionLoggerStats {
    return {
      totalLogged: this.totalLogged,
      lastWriteAt: this.lastWriteAt,
      dbPath: this.dbPath,
    };
  }

  /** Close the database connection. */
  close(): void {
    try {
      this.db?.close();
    } catch {
      // ignore close errors
    }
    this.db = null;
    this.insertStmt = null;
  }
}

export default InteractionLogger;
