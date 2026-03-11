/**
 * Tests for ObserverAgent — Issue #231
 *
 * Validates the observer agent's core functionality:
 * - LLM response parsing and validation
 * - Observation pass lifecycle (buffer → compress → persist)
 * - Mutex/lock preventing concurrent runs
 * - Retry logic on LLM failure
 * - Memory state updates
 * - Event-driven threshold integration
 * - Three-date model (observation_date, referenced_date)
 * - Priority assignment (🔴/🟡/🟢)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { ObservationStore } from '../observation-store';
import {
  ObserverAgent,
  parseLLMResponse,
  validateLLMObservation,
  type ObserverLLMClient,
  type ThresholdReachedEvent,
} from '../observer-agent';
import type { ConversationMessage } from '../conversation-engine';
import type { ObserverLLMObservation } from '../types/observation';

let tmpDir: string;
let dbPath: string;
let store: ObservationStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-agent-test-'));
  dbPath = path.join(tmpDir, 'test-obs.db');
  store = new ObservationStore(dbPath);
});

afterEach(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2, 10)}`,
    conversationId: 'conv-test-1',
    from: 'oracle',
    to: ['atlas'],
    deliveredTo: ['atlas'],
    content: 'Hello, this is a test message with some content.',
    createdAt: '2026-02-18T00:00:00.000Z',
    status: 'delivered',
    ...overrides,
  };
}

function makeMockLLM(response?: string): ObserverLLMClient {
  const defaultResponse = JSON.stringify([
    {
      content: 'User prefers dark mode for all applications.',
      priority: 'medium',
      referenced_date: null,
      source_message_ids: ['msg-001'],
    },
    {
      content: 'Team decided to use PostgreSQL for the analytics service.',
      priority: 'high',
      referenced_date: '2026-02-15',
      source_message_ids: ['msg-002', 'msg-003'],
    },
    {
      content: 'Next standup scheduled for Monday.',
      priority: 'info',
      referenced_date: '2026-02-23',
      source_message_ids: ['msg-004'],
    },
  ]);

  return {
    chatCompletion: jest.fn().mockResolvedValue(response ?? defaultResponse),
  };
}

function makeFailingLLM(error: string = 'API rate limit exceeded'): ObserverLLMClient {
  return {
    chatCompletion: jest.fn().mockRejectedValue(new Error(error)),
  };
}

// ─── parseLLMResponse ───────────────────────────────────────────────────────

describe('parseLLMResponse', () => {
  it('parses a valid JSON array', () => {
    const input = JSON.stringify([
      { content: 'Test obs', priority: 'high', referenced_date: null, source_message_ids: ['msg-1'] },
    ]);
    const result = parseLLMResponse(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Test obs');
    expect(result[0].priority).toBe('high');
  });

  it('strips markdown code fences', () => {
    const input = '```json\n[{"content":"Test","priority":"medium","referenced_date":null,"source_message_ids":[]}]\n```';
    const result = parseLLMResponse(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Test');
  });

  it('extracts JSON array from mixed text', () => {
    const input = 'Here are the observations:\n[{"content":"Extracted","priority":"info","referenced_date":null,"source_message_ids":[]}]\nDone.';
    const result = parseLLMResponse(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Extracted');
  });

  it('returns empty array for garbage input', () => {
    expect(parseLLMResponse('not json at all')).toEqual([]);
    expect(parseLLMResponse('')).toEqual([]);
    expect(parseLLMResponse('{}')).toEqual([]);
  });

  it('filters out invalid observations from array', () => {
    const input = JSON.stringify([
      { content: 'Valid', priority: 'high', referenced_date: null, source_message_ids: [] },
      { content: '', priority: 'high', referenced_date: null, source_message_ids: [] }, // empty content
      { content: 'No priority' }, // missing priority
      { content: 'Bad priority', priority: 'critical', referenced_date: null, source_message_ids: [] }, // invalid priority
      { content: 'Also valid', priority: 'info', referenced_date: '2026-01-01', source_message_ids: ['msg-x'] },
    ]);
    const result = parseLLMResponse(input);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Valid');
    expect(result[1].content).toBe('Also valid');
  });
});

// ─── validateLLMObservation ─────────────────────────────────────────────────

describe('validateLLMObservation', () => {
  it('accepts valid observations', () => {
    const valid = { content: 'Test', priority: 'high', referenced_date: null, source_message_ids: ['msg-1'] };
    const result = validateLLMObservation(valid);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Test');
    expect(result!.priority).toBe('high');
    expect(result!.referenced_date).toBeNull();
    expect(result!.source_message_ids).toEqual(['msg-1']);
  });

  it('rejects null/undefined', () => {
    expect(validateLLMObservation(null)).toBeNull();
    expect(validateLLMObservation(undefined)).toBeNull();
  });

  it('rejects empty content', () => {
    expect(validateLLMObservation({ content: '', priority: 'high', referenced_date: null, source_message_ids: [] })).toBeNull();
    expect(validateLLMObservation({ content: '  ', priority: 'high', referenced_date: null, source_message_ids: [] })).toBeNull();
  });

  it('rejects invalid priority values', () => {
    expect(validateLLMObservation({ content: 'Test', priority: 'critical' })).toBeNull();
    expect(validateLLMObservation({ content: 'Test', priority: 123 })).toBeNull();
    expect(validateLLMObservation({ content: 'Test' })).toBeNull();
  });

  it('handles missing source_message_ids gracefully', () => {
    const obs = validateLLMObservation({ content: 'Test', priority: 'info', referenced_date: null });
    expect(obs).not.toBeNull();
    expect(obs!.source_message_ids).toEqual([]);
  });

  it('filters non-string entries from source_message_ids', () => {
    const obs = validateLLMObservation({
      content: 'Test', priority: 'info', referenced_date: null,
      source_message_ids: ['msg-1', 123, null, 'msg-2'],
    });
    expect(obs!.source_message_ids).toEqual(['msg-1', 'msg-2']);
  });

  it('trims content whitespace', () => {
    const obs = validateLLMObservation({ content: '  trimmed  ', priority: 'high', referenced_date: null, source_message_ids: [] });
    expect(obs!.content).toBe('trimmed');
  });
});

// ─── ObserverAgent — Basic Observation Pass ─────────────────────────────────

describe('ObserverAgent', () => {
  describe('basic observation pass', () => {
    it('compresses buffered messages into observations', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      // Buffer 5 messages
      for (let i = 0; i < 5; i++) {
        observer.bufferMessage('oracle', makeMessage({ messageId: `msg-${i}`, content: `Test message ${i}` }));
      }

      const result = await observer.runObservationPass('oracle');

      expect(result.success).toBe(true);
      expect(result.observationsCreated).toBe(3); // LLM returns 3 observations
      expect(result.messagesCompressed).toBe(5);

      // Verify observations were persisted
      const stored = store.query({ status: 'processed' });
      expect(stored).toHaveLength(3);

      // Verify three-date model
      expect(stored[0].createdAt).toBeTruthy(); // observation_date
      // Check priorities
      const priorities = stored.map((o) => o.priority).sort();
      expect(priorities).toEqual(['high', 'info', 'medium']);

      // Check referenced_date on one observation
      const withDate = stored.find((o) => o.referencedDate);
      expect(withDate).toBeTruthy();
      expect(withDate!.referencedDate).toBe('2026-02-15');

      // Verify source_message_ids
      const highPriority = stored.find((o) => o.priority === 'high');
      expect(highPriority!.sourceMessageIds).toEqual(['msg-002', 'msg-003']);
    });

    it('clears buffer after successful pass', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      expect(observer.getBufferedMessages('oracle')).toHaveLength(1);

      await observer.runObservationPass('oracle');
      expect(observer.getBufferedMessages('oracle')).toHaveLength(0);
    });

    it('returns success with 0 observations for empty buffer', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      const result = await observer.runObservationPass('oracle');
      expect(result.success).toBe(true);
      expect(result.observationsCreated).toBe(0);
      expect(result.messagesCompressed).toBe(0);

      // LLM should NOT have been called
      expect(llm.chatCompletion).not.toHaveBeenCalled();
    });

    it('handles LLM returning empty array gracefully', async () => {
      const llm = makeMockLLM('[]');
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      const result = await observer.runObservationPass('oracle');

      expect(result.success).toBe(true);
      expect(result.observationsCreated).toBe(0);
      expect(result.messagesCompressed).toBe(1);
    });

    it('sends correct prompt structure to LLM', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { modelId: 'gpt-4o-mini', silent: true });

      observer.bufferMessage('oracle', makeMessage({ messageId: 'msg-check', content: 'Prompt test' }));
      await observer.runObservationPass('oracle');

      expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
      const call = (llm.chatCompletion as jest.Mock).mock.calls[0][0];
      expect(call.model).toBe('gpt-4o-mini');
      expect(call.messages).toHaveLength(2);
      expect(call.messages[0].role).toBe('system');
      expect(call.messages[1].role).toBe('user');
      expect(call.messages[1].content).toContain('msg-check');
      expect(call.messages[1].content).toContain('Prompt test');
      expect(call.temperature).toBe(0.3);
      expect(call.maxTokens).toBe(2000);
    });
  });

  // ─── Memory State ───────────────────────────────────────────────────

  describe('memory state', () => {
    it('creates memory state after first observation pass', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const state = store.getMemoryState('oracle');
      expect(state).not.toBeNull();
      expect(state!.agentId).toBe('oracle');
      expect(state!.observationsTokens).toBeGreaterThan(0);
      expect(state!.rawBufferTokens).toBe(0); // Reset after pass
      expect(state!.lastObservationAt).toBeTruthy();
      expect(state!.observationCount).toBe(3);
    });

    it('accumulates memory state across multiple passes', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const state1 = store.getMemoryState('oracle');
      expect(state1!.observationCount).toBe(3);

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const state2 = store.getMemoryState('oracle');
      expect(state2!.observationCount).toBe(6);
      expect(state2!.observationsTokens).toBeGreaterThan(state1!.observationsTokens);
    });

    it('returns null for agent with no memory state', () => {
      const state = store.getMemoryState('nonexistent');
      expect(state).toBeNull();
    });
  });

  // ─── Mutex / Concurrency ──────────────────────────────────────────

  describe('mutex', () => {
    it('prevents concurrent observation passes', async () => {
      // Create a slow LLM that takes time
      const slowLLM: ObserverLLMClient = {
        chatCompletion: jest.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return JSON.stringify([
            { content: 'Slow obs', priority: 'info', referenced_date: null, source_message_ids: [] },
          ]);
        }),
      };

      const observer = new ObserverAgent(store, slowLLM, { silent: true });
      observer.bufferMessage('oracle', makeMessage());

      // Start two passes concurrently
      const [result1, result2] = await Promise.all([
        observer.runObservationPass('oracle'),
        observer.runObservationPass('oracle'),
      ]);

      // One should succeed, one should be skipped due to lock
      const successes = [result1, result2].filter((r) => r.success);
      const skipped = [result1, result2].filter((r) => !r.success && r.error?.includes('already in progress'));

      expect(successes).toHaveLength(1);
      expect(skipped).toHaveLength(1);

      const metrics = observer.getMetrics();
      expect(metrics.skippedDueToLock).toBe(1);
    });

    it('releases mutex after failed pass', async () => {
      const failingLLM = makeFailingLLM();
      const observer = new ObserverAgent(store, failingLLM, { silent: true, maxRetries: 0 });

      observer.bufferMessage('oracle', makeMessage());

      // First pass fails
      const result1 = await observer.runObservationPass('oracle');
      expect(result1.success).toBe(false);
      expect(observer.isRunning()).toBe(false);

      // Second pass should not be blocked by mutex
      observer.bufferMessage('oracle', makeMessage());
      const result2 = await observer.runObservationPass('oracle');
      // Still fails (LLM still broken), but was NOT skipped due to lock
      expect(result2.error).not.toContain('already in progress');
    });
  });

  // ─── Retry Logic ──────────────────────────────────────────────────

  describe('retry logic', () => {
    it('retries once on LLM failure then succeeds', async () => {
      let callCount = 0;
      const flakeyLLM: ObserverLLMClient = {
        chatCompletion: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) throw new Error('Transient failure');
          return JSON.stringify([
            { content: 'Recovered observation', priority: 'info', referenced_date: null, source_message_ids: [] },
          ]);
        }),
      };

      const observer = new ObserverAgent(store, flakeyLLM, { silent: true, maxRetries: 1 });
      observer.bufferMessage('oracle', makeMessage());

      const result = await observer.runObservationPass('oracle');
      expect(result.success).toBe(true);
      expect(result.observationsCreated).toBe(1);
      expect(callCount).toBe(2); // First call failed, second succeeded
    });

    it('gives up after maxRetries + 1 attempts', async () => {
      const failLLM = makeFailingLLM('Persistent failure');
      const observer = new ObserverAgent(store, failLLM, { silent: true, maxRetries: 1 });

      observer.bufferMessage('oracle', makeMessage());
      const result = await observer.runObservationPass('oracle');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Persistent failure');
      expect(failLLM.chatCompletion).toHaveBeenCalledTimes(2); // 1 initial + 1 retry

      const metrics = observer.getMetrics();
      expect(metrics.llmFailures).toBe(1);
      expect(metrics.llmCalls).toBe(2);
    });

    it('respects maxRetries=0 (no retries)', async () => {
      const failLLM = makeFailingLLM();
      const observer = new ObserverAgent(store, failLLM, { silent: true, maxRetries: 0 });

      observer.bufferMessage('oracle', makeMessage());
      const result = await observer.runObservationPass('oracle');

      expect(result.success).toBe(false);
      expect(failLLM.chatCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Event Integration ────────────────────────────────────────────

  describe('event integration', () => {
    it('attaches to event bus and listens for threshold events', () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });
      const bus = new EventEmitter();

      expect(observer.isActive()).toBe(false);
      observer.attach(bus);
      expect(observer.isActive()).toBe(true);
    });

    it('detaches from event bus', () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });
      const bus = new EventEmitter();

      observer.attach(bus);
      expect(observer.isActive()).toBe(true);

      observer.detach();
      expect(observer.isActive()).toBe(false);
    });

    it('does not attach when disabled', () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { enabled: false, silent: true });
      const bus = new EventEmitter();

      observer.attach(bus);
      expect(observer.isActive()).toBe(false);
    });

    it('triggers observation pass on threshold event', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });
      const bus = new EventEmitter();
      observer.attach(bus);

      // Buffer some messages first
      observer.bufferMessage('oracle', makeMessage());

      // Emit threshold event
      bus.emit('observation:threshold_reached', {
        agentId: 'oracle',
        conversationId: 'conv-1',
        rawBufferTokens: 35000,
        thresholdTokens: 30000,
      } satisfies ThresholdReachedEvent);

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 200));

      // Verify observations were created
      const stored = store.query({ status: 'processed' });
      expect(stored.length).toBeGreaterThan(0);

      observer.detach();
    });
  });

  // ─── Metrics ──────────────────────────────────────────────────────

  describe('metrics', () => {
    it('tracks metrics across passes', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const metrics = observer.getMetrics();
      expect(metrics.passesAttempted).toBe(1);
      expect(metrics.passesCompleted).toBe(1);
      expect(metrics.observationsProduced).toBe(3);
      expect(metrics.llmCalls).toBe(1);
      expect(metrics.llmFailures).toBe(0);
      expect(metrics.messagesCompressed).toBe(1);
      expect(metrics.skippedDueToLock).toBe(0);
      expect(metrics.lastPassAt).toBeTruthy();
      expect(metrics.lastErrorAt).toBeNull();
    });

    it('tracks error metrics', async () => {
      const failLLM = makeFailingLLM();
      const observer = new ObserverAgent(store, failLLM, { silent: true, maxRetries: 0 });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const metrics = observer.getMetrics();
      expect(metrics.llmFailures).toBe(1);
      expect(metrics.lastErrorAt).toBeTruthy();
    });
  });

  // ─── Buffer Management ────────────────────────────────────────────

  describe('buffer management', () => {
    it('buffers messages per agent', () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage({ from: 'oracle' }));
      observer.bufferMessage('atlas', makeMessage({ from: 'atlas' }));
      observer.bufferMessage('oracle', makeMessage({ from: 'oracle' }));

      expect(observer.getBufferedMessages('oracle')).toHaveLength(2);
      expect(observer.getBufferedMessages('atlas')).toHaveLength(1);
      expect(observer.getBufferedMessages('nonexistent')).toHaveLength(0);
    });

    it('estimates buffer token count', () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { charsPerToken: 4, silent: true });

      // 48 chars / 4 = 12 tokens per message
      observer.bufferMessage('oracle', makeMessage({ content: 'Hello, this is a test message with some content.' }));
      const tokens = observer.getBufferTokenCount('oracle');
      expect(tokens).toBe(12);
    });

    it('clears buffer for specific agent', () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      observer.bufferMessage('atlas', makeMessage());

      observer.clearBuffer('oracle');
      expect(observer.getBufferedMessages('oracle')).toHaveLength(0);
      expect(observer.getBufferedMessages('atlas')).toHaveLength(1);
    });

    it('does not buffer when disabled', () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { enabled: false, silent: true });

      observer.bufferMessage('oracle', makeMessage());
      expect(observer.getBufferedMessages('oracle')).toHaveLength(0);
    });
  });

  // ─── Observation Store Phase 2 Schema ─────────────────────────────

  describe('store schema extensions', () => {
    it('persists priority field', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const obs = store.query({ status: 'processed' });
      for (const o of obs) {
        expect(['high', 'medium', 'info']).toContain(o.priority);
      }
    });

    it('persists referenced_date field', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const obs = store.query({ status: 'processed' });
      const withDate = obs.find((o) => o.referencedDate);
      expect(withDate).toBeTruthy();
      expect(withDate!.referencedDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('persists source_message_ids field', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const obs = store.query({ status: 'processed' });
      const withIds = obs.find((o) => o.sourceMessageIds && o.sourceMessageIds.length > 0);
      expect(withIds).toBeTruthy();
      expect(Array.isArray(withIds!.sourceMessageIds)).toBe(true);
    });

    it('persists memory_state correctly', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      const memState = store.getMemoryState('oracle');
      expect(memState).not.toBeNull();
      expect(memState!.agentId).toBe('oracle');
      expect(memState!.observationsTokens).toBeGreaterThan(0);
      expect(memState!.rawBufferTokens).toBe(0);
      expect(memState!.observationCount).toBe(3);
      expect(memState!.lastObservationAt).toBeTruthy();
      expect(memState!.lastReflectionAt).toBeNull();
    });
  });

  // ─── Integration Test: 40 messages → observations ─────────────────

  describe('integration: large message batch', () => {
    it('compresses 40 messages into observations with correct counts', async () => {
      // LLM returns 10 observations for a large batch
      const largeBatchResponse = JSON.stringify(
        Array.from({ length: 10 }, (_, i) => ({
          content: `Observation ${i + 1} from large batch compression.`,
          priority: i < 3 ? 'high' : i < 7 ? 'medium' : 'info',
          referenced_date: i === 0 ? '2026-03-01' : null,
          source_message_ids: [`msg-${i * 4}`, `msg-${i * 4 + 1}`, `msg-${i * 4 + 2}`, `msg-${i * 4 + 3}`],
        })),
      );

      const llm = makeMockLLM(largeBatchResponse);
      const observer = new ObserverAgent(store, llm, { silent: true });

      // Buffer 40 messages
      for (let i = 0; i < 40; i++) {
        observer.bufferMessage('oracle', makeMessage({
          messageId: `msg-${i}`,
          content: `This is test message number ${i} with various content about project decisions, preferences, and action items.`,
        }));
      }

      const result = await observer.runObservationPass('oracle');

      expect(result.success).toBe(true);
      expect(result.observationsCreated).toBe(10);
      expect(result.messagesCompressed).toBe(40);

      // Verify persistence
      const stored = store.query({ status: 'processed', limit: 100 });
      expect(stored).toHaveLength(10);

      // Verify priority distribution
      const highCount = stored.filter((o) => o.priority === 'high').length;
      const mediumCount = stored.filter((o) => o.priority === 'medium').length;
      const infoCount = stored.filter((o) => o.priority === 'info').length;
      expect(highCount).toBe(3);
      expect(mediumCount).toBe(4);
      expect(infoCount).toBe(3);

      // Verify memory state
      const memState = store.getMemoryState('oracle');
      expect(memState!.observationCount).toBe(10);
      expect(memState!.rawBufferTokens).toBe(0);
      expect(memState!.observationsTokens).toBeGreaterThan(0);

      // Verify buffer is cleared
      expect(observer.getBufferedMessages('oracle')).toHaveLength(0);
    });
  });

  // ─── Backward Compatibility ───────────────────────────────────────

  describe('backward compatibility', () => {
    it('Phase 1 observations (no priority/referencedDate) still work', () => {
      // Insert a Phase 1 style observation without new fields
      store.insert({
        id: 'obs-phase1-test',
        createdAt: '2026-02-18T00:00:00.000Z',
        category: 'token_usage',
        content: 'Token usage: 100 tokens',
        source: { agentId: 'oracle', conversationId: 'conv-1' },
        status: 'pending',
        tokenUsage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
      });

      const obs = store.getById('obs-phase1-test');
      expect(obs).not.toBeNull();
      expect(obs!.priority).toBeUndefined();
      expect(obs!.referencedDate).toBeUndefined();
      expect(obs!.sourceMessageIds).toBeUndefined();
    });

    it('Phase 1 query methods still work with Phase 2 data', async () => {
      const llm = makeMockLLM();
      const observer = new ObserverAgent(store, llm, { silent: true });

      // Insert Phase 1 observation
      store.insert({
        id: 'obs-phase1',
        createdAt: '2026-02-18T00:00:00.000Z',
        category: 'token_usage',
        content: 'Token usage',
        source: { agentId: 'oracle' },
        status: 'pending',
        tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      });

      // Insert Phase 2 observations
      observer.bufferMessage('oracle', makeMessage());
      await observer.runObservationPass('oracle');

      // Query all observations
      const all = store.query({ agentId: 'oracle', limit: 100 });
      expect(all.length).toBeGreaterThan(1); // Phase 1 + Phase 2

      // Count still works
      const count = store.count({ agentId: 'oracle' });
      expect(count).toBe(all.length);

      // Token usage summary still works (only counts token_usage category)
      const summary = store.getTokenUsageSummary({ agentId: 'oracle' });
      expect(summary.observationCount).toBe(1);
    });
  });
});
