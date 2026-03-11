/**
 * Curator Agent — VentureOS Daily Roundtable Synthesizer (Phase 5)
 *
 * Periodically (or on-demand) reads all agent outputs for a given day,
 * synthesizes them into a daily roundtable document, and optionally
 * updates the team priority stack.
 *
 * Design:
 * - Filesystem-based: reads from `agent-outputs/{agent}/` and writes
 *   to `roundtable/YYYY-MM-DD.md` within the team's shared-context dir.
 * - Bounded execution: configurable timeout, token budget (<5KB output),
 *   and total input cap to prevent runaway LLM calls.
 * - Non-blocking: runs in isolation, never throws into the caller's
 *   critical path. All errors are captured in the result object.
 * - Observable: emits structured log events and returns full metrics.
 *
 * Issue #245 — Phase 5 of #217: Curator Agent Template + Daily Roundtable
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { structuredLog } from './structured-logger';
import { teamSharedContextDir } from './paths';
import {
  CURATOR_SYSTEM_PROMPT,
  CURATOR_PRIORITY_SYSTEM_PROMPT,
  buildCuratorUserPrompt,
  buildCuratorPriorityPrompt,
  type CuratorAgentOutput,
} from './prompts/curator';

// ─── Constants ──────────────────────────────────────────────────────────────

const SUBSYSTEM = 'curator-agent';

/** Maximum roundtable output size in bytes. */
export const MAX_ROUNDTABLE_BYTES = 5000;

/** Maximum total input size in bytes (all agent outputs combined). */
export const MAX_TOTAL_INPUT_BYTES = 100_000; // 100KB

/** Default execution timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000; // 30s

/** Maximum number of agent output files to process per day. */
export const MAX_FILES_PER_DAY = 50;

// ─── Types ──────────────────────────────────────────────────────────────────

/** LLM call interface — injected for testability. */
export interface CuratorLLMClient {
  chatCompletion(params: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}

/** Configuration for the CuratorAgent. */
export interface CuratorAgentConfig {
  /** LLM client for synthesis calls. */
  llm: CuratorLLMClient;
  /** LLM model identifier for synthesis. Default: 'gpt-4o-mini'. */
  model?: string;
  /** Whether to update priorities.md after synthesis. Default: true. */
  updatePriorities?: boolean;
  /** Execution timeout in ms. Default: 30000. */
  timeoutMs?: number;
  /** Maximum roundtable output size in bytes. Default: 5000. */
  maxOutputBytes?: number;
  /** Maximum total input size in bytes. Default: 100000. */
  maxInputBytes?: number;
  /** Optional time source for testability. */
  now?: () => Date;
}

/** Result of a roundtable synthesis run. */
export interface RoundtableResult {
  /** Unique run identifier. */
  runId: string;
  /** Team name. */
  teamName: string;
  /** Date synthesized (YYYY-MM-DD). */
  date: string;
  /** Whether the run completed successfully. */
  success: boolean;
  /** Number of agents that had output. */
  agentCount: number;
  /** Number of output files processed. */
  fileCount: number;
  /** Total input bytes processed. */
  inputBytes: number;
  /** Roundtable output size in bytes. */
  outputBytes: number;
  /** Path to the written roundtable file (null if not written). */
  roundtablePath: string | null;
  /** Path to the updated priorities file (null if not updated). */
  prioritiesPath: string | null;
  /** Execution duration in ms. */
  durationMs: number;
  /** Error message if the run failed. */
  error?: string;
  /** Whether the run was skipped (no outputs for the day). */
  skipped: boolean;
}

/** Schedule configuration for automated curator runs. */
export interface CuratorScheduleConfig {
  /** Cron expression for daily runs. Default: '0 23 * * *' (11pm daily). */
  cron: string;
  /** Team name to run the curator for. */
  teamName: string;
  /** Timezone for the cron schedule. Default: 'America/Chicago'. */
  timezone: string;
  /** Whether the schedule is enabled. */
  enabled: boolean;
}

/** Default schedule configuration. */
export const DEFAULT_SCHEDULE_CONFIG: Readonly<CuratorScheduleConfig> = {
  cron: '0 23 * * *',
  teamName: '',
  timezone: 'America/Chicago',
  enabled: false,
} as const;

// ─── Curator Agent ──────────────────────────────────────────────────────────

export class CuratorAgent {
  private readonly llm: CuratorLLMClient;
  private readonly model: string;
  private readonly updatePriorities: boolean;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly maxInputBytes: number;
  private readonly now: () => Date;

  /** Mutex to prevent concurrent runs. */
  private running = false;

  constructor(config: CuratorAgentConfig) {
    if (!config?.llm) throw new Error('CuratorAgent requires llm client');
    this.llm = config.llm;
    this.model = config.model ?? 'gpt-4o-mini';
    this.updatePriorities = config.updatePriorities ?? true;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = config.maxOutputBytes ?? MAX_ROUNDTABLE_BYTES;
    this.maxInputBytes = config.maxInputBytes ?? MAX_TOTAL_INPUT_BYTES;
    this.now = config.now ?? (() => new Date());
  }

  /**
   * Check if a roundtable synthesis is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run the daily roundtable synthesis for a team.
   *
   * @param teamName - Team name (used to resolve shared-context directory).
   * @param date - Optional date override (YYYY-MM-DD). Defaults to today.
   * @returns RoundtableResult with full run details.
   */
  async synthesize(teamName: string, date?: string): Promise<RoundtableResult> {
    const runId = crypto.randomUUID();
    const startTime = Date.now();
    const targetDate = date ?? this.formatDate(this.now());

    // Prevent concurrent runs
    if (this.running) {
      structuredLog('warn', SUBSYSTEM, 'concurrent_run_blocked', 'Synthesis already in progress', { runId, teamName });
      return this.makeResult(runId, teamName, targetDate, {
        success: false,
        error: 'Synthesis already in progress (concurrent run blocked)',
        skipped: true,
        durationMs: Date.now() - startTime,
      });
    }

    this.running = true;
    structuredLog('info', SUBSYSTEM, 'synthesis_started', `Starting roundtable synthesis for ${teamName}`, { runId, teamName, date: targetDate });

    try {
      return await this.withTimeout(
        this.doSynthesize(runId, teamName, targetDate, startTime),
        this.timeoutMs,
      );
    } catch (err: any) {
      const errorMsg = err?.message ?? String(err);
      structuredLog('error', SUBSYSTEM, 'synthesis_failed', `Synthesis failed: ${errorMsg}`, { runId, teamName, date: targetDate });
      return this.makeResult(runId, teamName, targetDate, {
        success: false,
        error: errorMsg,
        skipped: false,
        durationMs: Date.now() - startTime,
      });
    } finally {
      this.running = false;
    }
  }

  // ─── Internal Pipeline ──────────────────────────────────────────────

  private async doSynthesize(
    runId: string,
    teamName: string,
    date: string,
    startTime: number,
  ): Promise<RoundtableResult> {
    // 1. Resolve team shared-context directory
    const teamDir = teamSharedContextDir(teamName);
    const agentOutputsDir = path.join(teamDir, 'agent-outputs');

    if (!fs.existsSync(agentOutputsDir)) {
      structuredLog('info', SUBSYSTEM, 'no_outputs_dir', `No agent-outputs directory for ${teamName}`, { runId, teamName });
      return this.makeResult(runId, teamName, date, {
        success: true,
        skipped: true,
        durationMs: Date.now() - startTime,
      });
    }

    // 2. Collect agent outputs for the target date
    const outputs = this.collectAgentOutputs(agentOutputsDir, date);

    if (outputs.length === 0) {
      structuredLog('info', SUBSYSTEM, 'no_outputs', `No agent outputs for ${teamName} on ${date}`, { runId, teamName, date });
      return this.makeResult(runId, teamName, date, {
        success: true,
        skipped: true,
        durationMs: Date.now() - startTime,
      });
    }

    // 3. Calculate input size and enforce limit
    const totalInputBytes = outputs.reduce((sum, o) => sum + Buffer.byteLength(o.content, 'utf-8'), 0);
    if (totalInputBytes > this.maxInputBytes) {
      structuredLog('warn', SUBSYSTEM, 'input_too_large', `Total input exceeds limit: ${totalInputBytes} > ${this.maxInputBytes}`, {
        runId, teamName, date, totalInputBytes, maxInputBytes: this.maxInputBytes,
      });
      return this.makeResult(runId, teamName, date, {
        success: false,
        error: `Total input size (${totalInputBytes} bytes) exceeds limit (${this.maxInputBytes} bytes)`,
        skipped: false,
        agentCount: new Set(outputs.map(o => o.agentId)).size,
        fileCount: outputs.length,
        inputBytes: totalInputBytes,
        durationMs: Date.now() - startTime,
      });
    }

    const agentCount = new Set(outputs.map(o => o.agentId)).size;
    structuredLog('info', SUBSYSTEM, 'outputs_collected', `Collected ${outputs.length} files from ${agentCount} agents`, {
      runId, teamName, date, fileCount: outputs.length, agentCount, totalInputBytes,
    });

    // 4. Call LLM for roundtable synthesis
    const userPrompt = buildCuratorUserPrompt(date, outputs);
    let roundtableContent: string;
    try {
      roundtableContent = await this.llm.chatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: CURATOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 2000,
      });
    } catch (err: any) {
      structuredLog('error', SUBSYSTEM, 'llm_synthesis_failed', `LLM synthesis call failed: ${err.message}`, { runId, teamName });
      return this.makeResult(runId, teamName, date, {
        success: false,
        error: `LLM synthesis failed: ${err.message}`,
        skipped: false,
        agentCount,
        fileCount: outputs.length,
        inputBytes: totalInputBytes,
        durationMs: Date.now() - startTime,
      });
    }

    // 5. Enforce output size limit
    const outputBytes = Buffer.byteLength(roundtableContent, 'utf-8');
    if (outputBytes > this.maxOutputBytes) {
      // Truncate with a warning footer
      const truncateTarget = this.maxOutputBytes - 100; // room for footer
      roundtableContent = roundtableContent.slice(0, truncateTarget) +
        '\n\n> ⚠️ _Roundtable truncated to fit 5KB budget._\n';
      structuredLog('warn', SUBSYSTEM, 'output_truncated', `Roundtable truncated: ${outputBytes} → ${this.maxOutputBytes}`, { runId });
    }

    // 6. Write roundtable to filesystem
    const roundtableDir = path.join(teamDir, 'roundtable');
    fs.mkdirSync(roundtableDir, { recursive: true });
    const roundtablePath = path.join(roundtableDir, `${date}.md`);
    fs.writeFileSync(roundtablePath, roundtableContent, 'utf-8');

    structuredLog('info', SUBSYSTEM, 'roundtable_written', `Roundtable written to ${roundtablePath}`, {
      runId, teamName, date, outputBytes: Buffer.byteLength(roundtableContent, 'utf-8'),
    });

    // 7. Optionally update priorities
    let prioritiesPath: string | null = null;
    if (this.updatePriorities) {
      prioritiesPath = await this.updatePrioritiesFile(runId, teamName, teamDir, date, roundtableContent);
    }

    const finalOutputBytes = Buffer.byteLength(roundtableContent, 'utf-8');
    return this.makeResult(runId, teamName, date, {
      success: true,
      skipped: false,
      agentCount,
      fileCount: outputs.length,
      inputBytes: totalInputBytes,
      outputBytes: finalOutputBytes,
      roundtablePath,
      prioritiesPath,
      durationMs: Date.now() - startTime,
    });
  }

  // ─── File Collection ────────────────────────────────────────────────

  /**
   * Collect agent output files for a specific date.
   *
   * Looks in `agent-outputs/{agentId}/` for files that either:
   * - Have the date in the filename (e.g., `2026-02-18-report.md`)
   * - Were modified on the target date
   *
   * Returns up to MAX_FILES_PER_DAY files, sorted by agent then filename.
   */
  collectAgentOutputs(agentOutputsDir: string, date: string): CuratorAgentOutput[] {
    const outputs: CuratorAgentOutput[] = [];

    let agentDirs: string[];
    try {
      agentDirs = fs.readdirSync(agentOutputsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch {
      return [];
    }

    for (const agentId of agentDirs) {
      const agentDir = path.join(agentOutputsDir, agentId);
      let files: string[];
      try {
        files = fs.readdirSync(agentDir);
      } catch {
        continue;
      }

      for (const filename of files) {
        const filePath = path.join(agentDir, filename);

        // Skip non-files
        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
          if (!stat.isFile()) continue;
        } catch {
          continue;
        }

        // Match by date in filename or modification date
        const fileDate = this.formatDate(stat.mtime);
        const filenameContainsDate = filename.includes(date);
        if (!filenameContainsDate && fileDate !== date) continue;

        // Read content
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          outputs.push({ agentId, filename, content });
        } catch {
          structuredLog('warn', SUBSYSTEM, 'file_read_failed', `Failed to read ${filePath}`);
        }

        if (outputs.length >= MAX_FILES_PER_DAY) break;
      }

      if (outputs.length >= MAX_FILES_PER_DAY) break;
    }

    // Sort by agent, then filename for deterministic ordering
    outputs.sort((a, b) => a.agentId.localeCompare(b.agentId) || a.filename.localeCompare(b.filename));
    return outputs;
  }

  // ─── Priority Update ───────────────────────────────────────────────

  private async updatePrioritiesFile(
    runId: string,
    teamName: string,
    teamDir: string,
    date: string,
    roundtableContent: string,
  ): Promise<string | null> {
    try {
      const priorityPrompt = buildCuratorPriorityPrompt(date, roundtableContent);
      const priorityContent = await this.llm.chatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: CURATOR_PRIORITY_SYSTEM_PROMPT },
          { role: 'user', content: priorityPrompt },
        ],
        temperature: 0.2,
        maxTokens: 1000,
      });

      const prioritiesPath = path.join(teamDir, 'priorities.md');
      fs.writeFileSync(prioritiesPath, priorityContent, 'utf-8');
      structuredLog('info', SUBSYSTEM, 'priorities_updated', `Priorities updated at ${prioritiesPath}`, { runId, teamName, date });
      return prioritiesPath;
    } catch (err: any) {
      // Priority update failure is non-fatal
      structuredLog('warn', SUBSYSTEM, 'priorities_update_failed', `Priority update failed: ${err.message}`, { runId, teamName });
      return null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private makeResult(
    runId: string,
    teamName: string,
    date: string,
    overrides: Partial<RoundtableResult>,
  ): RoundtableResult {
    return {
      runId,
      teamName,
      date,
      success: false,
      agentCount: 0,
      fileCount: 0,
      inputBytes: 0,
      outputBytes: 0,
      roundtablePath: null,
      prioritiesPath: null,
      durationMs: 0,
      skipped: false,
      ...overrides,
    };
  }

  /**
   * Wrap a promise with a timeout. Rejects with a descriptive error
   * if the promise doesn't resolve within the given time.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Curator synthesis timed out after ${ms}ms`)),
        ms,
      );
      promise
        .then((val) => { clearTimeout(timer); resolve(val); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }
}

// ─── Roundtable Scheduler ───────────────────────────────────────────────────

/**
 * RoundtableScheduler — lightweight scheduling glue for the CuratorAgent.
 *
 * Rather than inventing a new daemon, this provides:
 * 1. A `parseCron` utility to validate cron expressions
 * 2. A `shouldRunNow` check for heartbeat-triggered synthesis
 * 3. A `runIfDue` method that integrates with existing cron/job primitives
 *
 * Designed to be called from an existing heartbeat/cron hook rather than
 * running its own event loop.
 */
export class RoundtableScheduler {
  private readonly curator: CuratorAgent;
  private readonly config: CuratorScheduleConfig;
  private lastRunDate: string | null = null;
  private readonly now: () => Date;

  constructor(
    curator: CuratorAgent,
    config: Partial<CuratorScheduleConfig> & { teamName: string },
    now?: () => Date,
  ) {
    this.curator = curator;
    this.config = { ...DEFAULT_SCHEDULE_CONFIG, ...config };
    this.now = now ?? (() => new Date());
  }

  /**
   * Get the current schedule configuration.
   */
  getConfig(): Readonly<CuratorScheduleConfig> {
    return { ...this.config };
  }

  /**
   * Get the date of the last successful run.
   */
  getLastRunDate(): string | null {
    return this.lastRunDate;
  }

  /**
   * Check if the scheduler should run now based on:
   * 1. Schedule is enabled
   * 2. Current time matches the cron hour/minute
   * 3. Haven't already run today
   */
  shouldRunNow(): boolean {
    if (!this.config.enabled) return false;

    const now = this.now();
    const today = this.formatDate(now);

    // Already ran today
    if (this.lastRunDate === today) return false;

    // Parse cron for hour/minute check (simplified: minute hour * * *)
    const parsed = RoundtableScheduler.parseCronTime(this.config.cron);
    if (!parsed) return false;

    return now.getHours() === parsed.hour && now.getMinutes() === parsed.minute;
  }

  /**
   * Run the curator synthesis if it's due. Designed to be called from
   * an existing periodic heartbeat (e.g., every minute).
   *
   * Returns null if not due, or the RoundtableResult if run.
   */
  async runIfDue(): Promise<RoundtableResult | null> {
    if (!this.shouldRunNow()) return null;

    const today = this.formatDate(this.now());
    const result = await this.curator.synthesize(this.config.teamName, today);

    if (result.success) {
      this.lastRunDate = today;
    }

    return result;
  }

  /**
   * Force a run regardless of schedule. Used for manual triggers.
   */
  async forceRun(date?: string): Promise<RoundtableResult> {
    const targetDate = date ?? this.formatDate(this.now());
    const result = await this.curator.synthesize(this.config.teamName, targetDate);

    if (result.success) {
      this.lastRunDate = targetDate;
    }

    return result;
  }

  // ─── Cron Utilities ─────────────────────────────────────────────────

  /**
   * Parse a simple cron expression to extract hour and minute.
   * Supports standard `minute hour * * *` format.
   * Returns null if the expression is invalid or uses complex patterns.
   */
  static parseCronTime(cron: string): { minute: number; hour: number } | null {
    if (!cron || typeof cron !== 'string') return null;

    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const [minuteStr, hourStr] = parts;

    // Only support simple numeric values (no ranges, lists, steps)
    const minute = Number(minuteStr);
    const hour = Number(hourStr);

    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;

    return { minute, hour };
  }

  /**
   * Validate a cron expression for use with the scheduler.
   */
  static isValidCron(cron: string): boolean {
    return RoundtableScheduler.parseCronTime(cron) !== null;
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export default { CuratorAgent, RoundtableScheduler, DEFAULT_SCHEDULE_CONFIG };
