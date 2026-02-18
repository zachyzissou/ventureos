/**
 * Tests for CuratorAgent + RoundtableScheduler — Issue #245
 * Phase 5 of #217 (Shared Agent Memory Layer)
 *
 * Validates:
 * - Roundtable synthesis with multiple agent outputs
 * - Empty day handling (no outputs = graceful skip)
 * - Token budget enforcement (<5KB output)
 * - Priority extraction and update
 * - Single-agent degenerate case
 * - Concurrent run protection (mutex)
 * - Timeout enforcement
 * - File collection logic (date matching)
 * - Scheduler cron parsing and shouldRunNow logic
 * - Scheduler runIfDue / forceRun integration
 * - LLM failure resilience
 * - Input size limit enforcement
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Test Helpers ───────────────────────────────────────────────────────────

let tmpDir: string;
let sharedContextRoot: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-agent-test-'));
  sharedContextRoot = path.join(tmpDir, 'shared-context');
  fs.mkdirSync(sharedContextRoot, { recursive: true });

  // Point SHARED_CONTEXT to our temp dir
  process.env.SHARED_CONTEXT = sharedContextRoot;
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SHARED_CONTEXT;
  jest.resetModules();
});

/**
 * Create a team shared-context directory with agent outputs.
 */
function setupTeamOutputs(
  teamName: string,
  outputs: Array<{ agentId: string; filename: string; content: string; mtime?: Date }>,
): string {
  const teamDir = path.join(sharedContextRoot, teamName);
  const agentOutputsDir = path.join(teamDir, 'agent-outputs');
  const roundtableDir = path.join(teamDir, 'roundtable');
  fs.mkdirSync(agentOutputsDir, { recursive: true });
  fs.mkdirSync(roundtableDir, { recursive: true });

  for (const output of outputs) {
    const agentDir = path.join(agentOutputsDir, output.agentId);
    fs.mkdirSync(agentDir, { recursive: true });
    const filePath = path.join(agentDir, output.filename);
    fs.writeFileSync(filePath, output.content, 'utf-8');
    if (output.mtime) {
      fs.utimesSync(filePath, output.mtime, output.mtime);
    }
  }

  return teamDir;
}

/** Create a mock LLM client that returns a predetermined response. */
function mockLLM(response: string = '# Daily Roundtable\n\nTest roundtable content.') {
  return {
    chatCompletion: jest.fn().mockResolvedValue(response),
  };
}

/** Create a mock LLM that returns different responses for synthesis vs priority calls. */
function mockLLMWithPriorities(
  synthesisResponse: string = '# Daily Roundtable\n\nSynthesis.',
  priorityResponse: string = '# Team Priorities\n\n1. Test priority',
) {
  const fn = jest.fn()
    .mockResolvedValueOnce(synthesisResponse)
    .mockResolvedValueOnce(priorityResponse);
  return { chatCompletion: fn };
}

/** Create a mock LLM that throws on the first call. */
function mockLLMFailing(error: string = 'LLM API error') {
  return {
    chatCompletion: jest.fn().mockRejectedValue(new Error(error)),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CuratorAgent', () => {
  async function createCurator(overrides: Record<string, any> = {}) {
    const { CuratorAgent } = await import('../curator-agent');
    const llm = overrides.llm ?? mockLLM();
    return {
      curator: new CuratorAgent({
        llm,
        timeoutMs: overrides.timeoutMs ?? 5000,
        now: overrides.now ?? (() => new Date('2026-02-18T23:00:00Z')),
        ...overrides,
      }),
      llm,
    };
  }

  // ─── Core Synthesis ─────────────────────────────────────────────────

  describe('synthesize()', () => {
    it('produces roundtable from multiple agent outputs', async () => {
      setupTeamOutputs('test-team', [
        { agentId: 'nexus', filename: '2026-02-18-status.md', content: 'Nexus completed PR #42.' },
        { agentId: 'oracle', filename: '2026-02-18-research.md', content: 'Oracle found 3 security risks.' },
        { agentId: 'synth', filename: '2026-02-18-build.md', content: 'Synth deployed v2.1.0.' },
      ]);

      const roundtableContent = '# Daily Roundtable — 2026-02-18\n\n## Summary\nThree agents active.\n\n## Agent Activity\n- **nexus**: Completed PR #42\n- **oracle**: Found 3 security risks\n- **synth**: Deployed v2.1.0';
      const { curator, llm } = await createCurator({ llm: mockLLMWithPriorities(roundtableContent) });

      const result = await curator.synthesize('test-team', '2026-02-18');

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.agentCount).toBe(3);
      expect(result.fileCount).toBe(3);
      expect(result.roundtablePath).toContain('roundtable/2026-02-18.md');
      expect(result.outputBytes).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify file was actually written
      const written = fs.readFileSync(result.roundtablePath!, 'utf-8');
      expect(written).toContain('Daily Roundtable');

      // Verify LLM was called with correct structure
      expect(llm.chatCompletion).toHaveBeenCalledTimes(2); // synthesis + priority
      const firstCall = llm.chatCompletion.mock.calls[0][0];
      expect(firstCall.messages[0].role).toBe('system');
      expect(firstCall.messages[1].role).toBe('user');
      expect(firstCall.messages[1].content.toLowerCase()).toContain('nexus');
      expect(firstCall.messages[1].content.toLowerCase()).toContain('oracle');
      expect(firstCall.messages[1].content.toLowerCase()).toContain('synth');
    });

    it('handles single-agent degenerate case', async () => {
      setupTeamOutputs('solo-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Only agent working today.' },
      ]);

      const { curator } = await createCurator({ llm: mockLLMWithPriorities() });
      const result = await curator.synthesize('solo-team', '2026-02-18');

      expect(result.success).toBe(true);
      expect(result.agentCount).toBe(1);
      expect(result.fileCount).toBe(1);
      expect(result.roundtablePath).not.toBeNull();
    });

    it('gracefully skips when no outputs exist for the day', async () => {
      // Create team dir but no outputs for target date
      const teamDir = path.join(sharedContextRoot, 'empty-team');
      fs.mkdirSync(path.join(teamDir, 'agent-outputs', 'nexus'), { recursive: true });
      const oldFilePath = path.join(teamDir, 'agent-outputs', 'nexus', '2026-02-17-old.md');
      fs.writeFileSync(oldFilePath, 'Old stuff');
      // Set mtime to an old date so it doesn't match 2026-02-18
      const oldDate = new Date('2026-02-17T12:00:00Z');
      fs.utimesSync(oldFilePath, oldDate, oldDate);

      const { curator, llm } = await createCurator();
      const result = await curator.synthesize('empty-team', '2026-02-18');

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.agentCount).toBe(0);
      expect(result.roundtablePath).toBeNull();
      // LLM should NOT have been called
      expect(llm.chatCompletion).not.toHaveBeenCalled();
    });

    it('gracefully skips when agent-outputs directory does not exist', async () => {
      const teamDir = path.join(sharedContextRoot, 'no-outputs-team');
      fs.mkdirSync(teamDir, { recursive: true });

      const { curator, llm } = await createCurator();
      const result = await curator.synthesize('no-outputs-team', '2026-02-18');

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(llm.chatCompletion).not.toHaveBeenCalled();
    });

    it('uses today date when no date parameter provided', async () => {
      const fixedDate = new Date('2026-02-18T23:00:00Z');
      setupTeamOutputs('auto-date-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work done.' },
      ]);

      const { curator } = await createCurator({
        llm: mockLLMWithPriorities(),
        now: () => fixedDate,
      });
      const result = await curator.synthesize('auto-date-team');

      expect(result.date).toBe('2026-02-18');
      expect(result.success).toBe(true);
    });
  });

  // ─── Token Budget Enforcement ───────────────────────────────────────

  describe('output size enforcement', () => {
    it('truncates roundtable output exceeding 5KB', async () => {
      setupTeamOutputs('big-output-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work done.' },
      ]);

      // Generate a response >5KB
      const bigResponse = '# Roundtable\n\n' + 'A'.repeat(6000);
      const { curator } = await createCurator({
        llm: mockLLMWithPriorities(bigResponse),
      });

      const result = await curator.synthesize('big-output-team', '2026-02-18');

      expect(result.success).toBe(true);
      const written = fs.readFileSync(result.roundtablePath!, 'utf-8');
      expect(Buffer.byteLength(written, 'utf-8')).toBeLessThanOrEqual(5100); // small tolerance for truncation footer
      expect(written).toContain('truncated');
    });

    it('respects custom maxOutputBytes', async () => {
      setupTeamOutputs('custom-limit-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work done.' },
      ]);

      const response = 'A'.repeat(3000);
      const { curator } = await createCurator({
        llm: mockLLMWithPriorities(response),
        maxOutputBytes: 2000,
      });

      const result = await curator.synthesize('custom-limit-team', '2026-02-18');
      expect(result.success).toBe(true);
      const written = fs.readFileSync(result.roundtablePath!, 'utf-8');
      expect(written).toContain('truncated');
    });
  });

  // ─── Input Size Enforcement ─────────────────────────────────────────

  describe('input size enforcement', () => {
    it('rejects when total input exceeds maxInputBytes', async () => {
      setupTeamOutputs('huge-input-team', [
        { agentId: 'nexus', filename: '2026-02-18-huge.md', content: 'X'.repeat(50_000) },
        { agentId: 'oracle', filename: '2026-02-18-huge.md', content: 'Y'.repeat(60_000) },
      ]);

      const { curator, llm } = await createCurator({ maxInputBytes: 80_000 });
      const result = await curator.synthesize('huge-input-team', '2026-02-18');

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds limit');
      expect(llm.chatCompletion).not.toHaveBeenCalled();
    });
  });

  // ─── Priority Update ───────────────────────────────────────────────

  describe('priority update', () => {
    it('writes updated priorities.md after synthesis', async () => {
      setupTeamOutputs('priority-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Shipped feature X.' },
      ]);

      const priorityContent = '# Team Priorities\n\n_Updated: 2026-02-18_\n\n1. Ship feature Y (source: roundtable)';
      const { curator } = await createCurator({
        llm: mockLLMWithPriorities('# Roundtable\n\nContent.', priorityContent),
        updatePriorities: true,
      });

      const result = await curator.synthesize('priority-team', '2026-02-18');

      expect(result.success).toBe(true);
      expect(result.prioritiesPath).not.toBeNull();
      const written = fs.readFileSync(result.prioritiesPath!, 'utf-8');
      expect(written).toContain('Team Priorities');
      expect(written).toContain('feature Y');
    });

    it('skips priority update when updatePriorities is false', async () => {
      setupTeamOutputs('no-priority-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work.' },
      ]);

      const { curator, llm } = await createCurator({
        llm: mockLLM(),
        updatePriorities: false,
      });
      const result = await curator.synthesize('no-priority-team', '2026-02-18');

      expect(result.success).toBe(true);
      expect(result.prioritiesPath).toBeNull();
      // Only 1 LLM call (synthesis only, no priority)
      expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('succeeds even when priority update LLM call fails', async () => {
      setupTeamOutputs('priority-fail-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work.' },
      ]);

      const llm = {
        chatCompletion: jest.fn()
          .mockResolvedValueOnce('# Roundtable\n\nContent.') // synthesis succeeds
          .mockRejectedValueOnce(new Error('Priority LLM failed')), // priority fails
      };

      const { curator } = await createCurator({ llm, updatePriorities: true });
      const result = await curator.synthesize('priority-fail-team', '2026-02-18');

      // Overall run still succeeds — priority failure is non-fatal
      expect(result.success).toBe(true);
      expect(result.roundtablePath).not.toBeNull();
      expect(result.prioritiesPath).toBeNull();
    });
  });

  // ─── LLM Failure Resilience ─────────────────────────────────────────

  describe('LLM failure handling', () => {
    it('returns failure result when synthesis LLM call fails', async () => {
      setupTeamOutputs('llm-fail-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work.' },
      ]);

      const { curator } = await createCurator({ llm: mockLLMFailing('API timeout') });
      const result = await curator.synthesize('llm-fail-team', '2026-02-18');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
      expect(result.roundtablePath).toBeNull();
    });
  });

  // ─── Concurrent Run Protection ──────────────────────────────────────

  describe('mutex / concurrent run protection', () => {
    it('blocks concurrent synthesis runs', async () => {
      setupTeamOutputs('mutex-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work.' },
      ]);

      // LLM that takes time to resolve
      let resolveCall: (value: string) => void;
      const llm = {
        chatCompletion: jest.fn().mockImplementation(
          () => new Promise<string>((resolve) => { resolveCall = resolve; }),
        ),
      };

      const { curator } = await createCurator({ llm, updatePriorities: false });

      // Start first run (will block on LLM)
      const firstRun = curator.synthesize('mutex-team', '2026-02-18');

      // Wait a tick for the first run to acquire the mutex
      await new Promise(r => setTimeout(r, 10));

      // Second run should be blocked
      const secondResult = await curator.synthesize('mutex-team', '2026-02-18');
      expect(secondResult.success).toBe(false);
      expect(secondResult.skipped).toBe(true);
      expect(secondResult.error).toContain('concurrent');

      // Complete the first run
      resolveCall!('# Roundtable');
      const firstResult = await firstRun;
      expect(firstResult.success).toBe(true);
    });
  });

  // ─── Timeout Enforcement ────────────────────────────────────────────

  describe('timeout enforcement', () => {
    it('times out long-running synthesis', async () => {
      setupTeamOutputs('timeout-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work.' },
      ]);

      // LLM that never resolves
      const llm = {
        chatCompletion: jest.fn().mockImplementation(
          () => new Promise(() => { /* never resolves */ }),
        ),
      };

      const { curator } = await createCurator({ llm, timeoutMs: 100 });
      const result = await curator.synthesize('timeout-team', '2026-02-18');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 10_000);
  });

  // ─── File Collection Logic ──────────────────────────────────────────

  describe('collectAgentOutputs()', () => {
    it('matches files by date in filename', async () => {
      setupTeamOutputs('collect-team', [
        { agentId: 'nexus', filename: '2026-02-18-report.md', content: 'Today report' },
        { agentId: 'nexus', filename: '2026-02-17-old.md', content: 'Yesterday report', mtime: new Date('2026-02-17T12:00:00Z') },
      ]);

      const { CuratorAgent } = await import('../curator-agent');
      const curator = new CuratorAgent({ llm: mockLLM() });
      const outputsDir = path.join(sharedContextRoot, 'collect-team', 'agent-outputs');
      const results = curator.collectAgentOutputs(outputsDir, '2026-02-18');

      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe('2026-02-18-report.md');
      expect(results[0].agentId).toBe('nexus');
    });

    it('matches files by modification date', async () => {
      const today = new Date('2026-02-18T12:00:00Z');
      setupTeamOutputs('mtime-team', [
        { agentId: 'oracle', filename: 'analysis.md', content: 'Analysis', mtime: today },
        { agentId: 'oracle', filename: 'old-analysis.md', content: 'Old', mtime: new Date('2026-02-16T12:00:00Z') },
      ]);

      const { CuratorAgent } = await import('../curator-agent');
      const curator = new CuratorAgent({ llm: mockLLM() });
      const outputsDir = path.join(sharedContextRoot, 'mtime-team', 'agent-outputs');
      const results = curator.collectAgentOutputs(outputsDir, '2026-02-18');

      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe('analysis.md');
    });

    it('returns empty array when directory is missing', async () => {
      const { CuratorAgent } = await import('../curator-agent');
      const curator = new CuratorAgent({ llm: mockLLM() });
      const results = curator.collectAgentOutputs('/nonexistent/path', '2026-02-18');

      expect(results).toEqual([]);
    });

    it('sorts outputs by agent then filename', async () => {
      setupTeamOutputs('sort-team', [
        { agentId: 'synth', filename: '2026-02-18-b.md', content: 'B' },
        { agentId: 'nexus', filename: '2026-02-18-a.md', content: 'A' },
        { agentId: 'synth', filename: '2026-02-18-a.md', content: 'A' },
        { agentId: 'nexus', filename: '2026-02-18-b.md', content: 'B' },
      ]);

      const { CuratorAgent } = await import('../curator-agent');
      const curator = new CuratorAgent({ llm: mockLLM() });
      const outputsDir = path.join(sharedContextRoot, 'sort-team', 'agent-outputs');
      const results = curator.collectAgentOutputs(outputsDir, '2026-02-18');

      expect(results.map(r => `${r.agentId}/${r.filename}`)).toEqual([
        'nexus/2026-02-18-a.md',
        'nexus/2026-02-18-b.md',
        'synth/2026-02-18-a.md',
        'synth/2026-02-18-b.md',
      ]);
    });

    it('respects MAX_FILES_PER_DAY limit', async () => {
      const outputs = Array.from({ length: 60 }, (_, i) => ({
        agentId: 'nexus',
        filename: `2026-02-18-file-${String(i).padStart(3, '0')}.md`,
        content: `File ${i}`,
      }));
      setupTeamOutputs('many-files-team', outputs);

      const { CuratorAgent, MAX_FILES_PER_DAY } = await import('../curator-agent');
      const curator = new CuratorAgent({ llm: mockLLM() });
      const outputsDir = path.join(sharedContextRoot, 'many-files-team', 'agent-outputs');
      const results = curator.collectAgentOutputs(outputsDir, '2026-02-18');

      expect(results.length).toBeLessThanOrEqual(MAX_FILES_PER_DAY);
    });
  });

  // ─── isRunning ──────────────────────────────────────────────────────

  describe('isRunning()', () => {
    it('returns false when idle', async () => {
      const { curator } = await createCurator();
      expect(curator.isRunning()).toBe(false);
    });
  });
});

// ─── RoundtableScheduler Tests ──────────────────────────────────────────────

describe('RoundtableScheduler', () => {
  async function createScheduler(overrides: Record<string, any> = {}) {
    const { CuratorAgent, RoundtableScheduler } = await import('../curator-agent');
    const llm = overrides.llm ?? mockLLMWithPriorities();
    const now = overrides.now ?? (() => new Date('2026-02-18T23:00:00Z'));
    const curator = new CuratorAgent({ llm, timeoutMs: 5000, now, ...overrides.curatorOverrides });
    const scheduler = new RoundtableScheduler(
      curator,
      {
        teamName: overrides.teamName ?? 'test-team',
        cron: overrides.cron ?? '0 23 * * *',
        enabled: overrides.enabled ?? true,
        ...(overrides.scheduleOverrides ?? {}),
      },
      now,
    );
    return { scheduler, curator, llm, RoundtableScheduler };
  }

  // ─── Cron Parsing ───────────────────────────────────────────────────

  describe('parseCronTime()', () => {
    it('parses standard daily cron', async () => {
      const { RoundtableScheduler } = await import('../curator-agent');
      expect(RoundtableScheduler.parseCronTime('0 23 * * *')).toEqual({ minute: 0, hour: 23 });
      expect(RoundtableScheduler.parseCronTime('30 8 * * *')).toEqual({ minute: 30, hour: 8 });
      expect(RoundtableScheduler.parseCronTime('0 0 * * *')).toEqual({ minute: 0, hour: 0 });
    });

    it('returns null for invalid cron expressions', async () => {
      const { RoundtableScheduler } = await import('../curator-agent');
      expect(RoundtableScheduler.parseCronTime('')).toBeNull();
      expect(RoundtableScheduler.parseCronTime('invalid')).toBeNull();
      expect(RoundtableScheduler.parseCronTime('60 23 * * *')).toBeNull(); // minute > 59
      expect(RoundtableScheduler.parseCronTime('0 24 * * *')).toBeNull(); // hour > 23
      expect(RoundtableScheduler.parseCronTime('-1 0 * * *')).toBeNull(); // negative minute
      expect(RoundtableScheduler.parseCronTime('* * * * *')).toBeNull(); // wildcard minute/hour
    });
  });

  describe('isValidCron()', () => {
    it('validates well-formed cron expressions', async () => {
      const { RoundtableScheduler } = await import('../curator-agent');
      expect(RoundtableScheduler.isValidCron('0 23 * * *')).toBe(true);
      expect(RoundtableScheduler.isValidCron('garbage')).toBe(false);
    });
  });

  // ─── shouldRunNow ───────────────────────────────────────────────────

  describe('shouldRunNow()', () => {
    it('returns true when time matches cron and has not run today', async () => {
      // Construct a date whose local getHours()===23, getMinutes()===0
      const d = new Date(2026, 1, 18, 23, 0, 0); // Feb 18, 2026 at 23:00 local
      const { scheduler } = await createScheduler({
        now: () => d,
        cron: '0 23 * * *',
      });
      expect(scheduler.shouldRunNow()).toBe(true);
    });

    it('returns false when time does not match cron', async () => {
      const d = new Date(2026, 1, 18, 14, 0, 0); // Feb 18, 2026 at 14:00 local
      const { scheduler } = await createScheduler({
        now: () => d,
        cron: '0 23 * * *',
      });
      expect(scheduler.shouldRunNow()).toBe(false);
    });

    it('returns false when schedule is disabled', async () => {
      const { scheduler } = await createScheduler({
        now: () => new Date('2026-02-18T23:00:00Z'),
        enabled: false,
      });
      expect(scheduler.shouldRunNow()).toBe(false);
    });

    it('returns false when already ran today', async () => {
      const d = new Date(2026, 1, 18, 23, 0, 0);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      setupTeamOutputs('ran-today-team', [
        { agentId: 'nexus', filename: `${dateStr}-work.md`, content: 'Work.' },
      ]);

      const { scheduler } = await createScheduler({
        teamName: 'ran-today-team',
        now: () => d,
        cron: '0 23 * * *',
      });

      // Force a run to set lastRunDate
      await scheduler.forceRun(dateStr);
      expect(scheduler.shouldRunNow()).toBe(false);
    });
  });

  // ─── runIfDue ───────────────────────────────────────────────────────

  describe('runIfDue()', () => {
    it('runs when due and returns result', async () => {
      const d = new Date(2026, 1, 18, 23, 0, 0); // local 23:00
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      setupTeamOutputs('due-team', [
        { agentId: 'nexus', filename: `${dateStr}-work.md`, content: 'Work.' },
      ]);

      const { scheduler } = await createScheduler({
        teamName: 'due-team',
        now: () => d,
        cron: '0 23 * * *',
      });

      const result = await scheduler.runIfDue();
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(scheduler.getLastRunDate()).toBe(dateStr);
    });

    it('returns null when not due', async () => {
      const { scheduler } = await createScheduler({
        now: () => new Date('2026-02-18T14:00:00Z'),
        cron: '0 23 * * *',
      });

      const result = await scheduler.runIfDue();
      expect(result).toBeNull();
    });

    it('does not update lastRunDate on failure', async () => {
      const d = new Date(2026, 1, 18, 23, 0, 0);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      setupTeamOutputs('fail-due-team', [
        { agentId: 'nexus', filename: `${dateStr}-work.md`, content: 'Work.' },
      ]);

      const { scheduler } = await createScheduler({
        teamName: 'fail-due-team',
        now: () => d,
        cron: '0 23 * * *',
        llm: mockLLMFailing(),
      });

      const result = await scheduler.runIfDue();
      expect(result).not.toBeNull();
      expect(result!.success).toBe(false);
      expect(scheduler.getLastRunDate()).toBeNull();
    });
  });

  // ─── forceRun ───────────────────────────────────────────────────────

  describe('forceRun()', () => {
    it('runs regardless of schedule', async () => {
      setupTeamOutputs('force-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work.' },
      ]);

      const { scheduler } = await createScheduler({
        teamName: 'force-team',
        now: () => new Date('2026-02-18T14:00:00Z'), // Not at schedule time
        enabled: false, // Schedule disabled
      });

      const result = await scheduler.forceRun('2026-02-18');
      expect(result.success).toBe(true);
      expect(scheduler.getLastRunDate()).toBe('2026-02-18');
    });

    it('uses current date when no date provided', async () => {
      const fixedDate = new Date('2026-02-18T14:00:00Z');
      setupTeamOutputs('force-today-team', [
        { agentId: 'nexus', filename: '2026-02-18-work.md', content: 'Work.' },
      ]);

      const { scheduler } = await createScheduler({
        teamName: 'force-today-team',
        now: () => fixedDate,
      });

      const result = await scheduler.forceRun();
      expect(result.date).toBe('2026-02-18');
    });
  });

  // ─── Config Accessors ───────────────────────────────────────────────

  describe('config accessors', () => {
    it('returns schedule config', async () => {
      const { scheduler } = await createScheduler({
        teamName: 'config-team',
        cron: '30 8 * * *',
      });

      const config = scheduler.getConfig();
      expect(config.teamName).toBe('config-team');
      expect(config.cron).toBe('30 8 * * *');
      expect(config.enabled).toBe(true);
    });

    it('returns null for lastRunDate when never run', async () => {
      const { scheduler } = await createScheduler();
      expect(scheduler.getLastRunDate()).toBeNull();
    });
  });
});

// ─── Curator Prompt Tests ───────────────────────────────────────────────────

describe('Curator Prompts', () => {
  it('builds user prompt with agent outputs', async () => {
    const { buildCuratorUserPrompt } = await import('../prompts/curator');
    const prompt = buildCuratorUserPrompt('2026-02-18', [
      { agentId: 'nexus', filename: 'report.md', content: 'Nexus report.' },
      { agentId: 'oracle', filename: 'analysis.md', content: 'Oracle analysis.' },
    ]);

    expect(prompt).toContain('Date: 2026-02-18');
    expect(prompt).toContain('Agent count: 2');
    expect(prompt).toContain('BEGIN NEXUS OUTPUT');
    expect(prompt).toContain('Nexus report.');
    expect(prompt).toContain('BEGIN ORACLE OUTPUT');
    expect(prompt).toContain('Oracle analysis.');
  });

  it('builds priority extraction prompt', async () => {
    const { buildCuratorPriorityPrompt } = await import('../prompts/curator');
    const prompt = buildCuratorPriorityPrompt('2026-02-18', '# Roundtable\n\nContent.');

    expect(prompt).toContain('Date: 2026-02-18');
    expect(prompt).toContain('--- ROUNDTABLE ---');
    expect(prompt).toContain('# Roundtable');
  });

  it('system prompts are non-empty strings', async () => {
    const { CURATOR_SYSTEM_PROMPT, CURATOR_PRIORITY_SYSTEM_PROMPT } = await import('../prompts/curator');
    expect(typeof CURATOR_SYSTEM_PROMPT).toBe('string');
    expect(CURATOR_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(typeof CURATOR_PRIORITY_SYSTEM_PROMPT).toBe('string');
    expect(CURATOR_PRIORITY_SYSTEM_PROMPT.length).toBeGreaterThan(50);
  });
});

// ─── SquadRole Integration ──────────────────────────────────────────────────

describe('SquadRole integration', () => {
  it('curator is a valid SquadRole', async () => {
    // Runtime assertion that 'curator' is accepted as a SquadRole.
    // The real check is that tsc compiles this file with the type annotation below.
    const curatorRole: import('../mission-state-machine').SquadRole = 'curator';
    expect(curatorRole).toBe('curator');
  });
});
