/**
 * Tests for TokenCounterHook — Issue #230
 *
 * Validates that the token counter hook correctly integrates with
 * the ConversationAPI event stream and writes token_usage observations
 * to the ObservationStore.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { ObservationStore } from '../observation-store';
import { TokenCounterHook, estimateTokens } from '../token-counter-hook';
import type { ConversationAPI } from '../conversation-api';
import type { ConversationMessage, ConversationState } from '../conversation-engine';

let tmpDir: string;
let dbPath: string;
let store: ObservationStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-hook-test-'));
  dbPath = path.join(tmpDir, 'test-obs.db');
  store = new ObservationStore(dbPath);
});

afterEach(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Create a mock ConversationAPI that emits events.
 * We only need EventEmitter behavior for hook testing.
 */
function createMockApi(): ConversationAPI {
  return new EventEmitter() as unknown as ConversationAPI;
}

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
  } as ConversationMessage;
}

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    conversationId: 'conv-test-1',
    createdAt: '2026-02-18T00:00:00.000Z',
    updatedAt: '2026-02-18T00:01:00.000Z',
    status: 'active',
    participants: ['oracle', 'atlas'],
    currentTurn: 'atlas',
    tokenBudget: 10000,
    tokensUsed: 100,
    messageCount: 1,
    challengeCount: 0,
    consecutiveChallenges: 0,
    injectionScores: [],
    policyViolationCount: 0,
    voiceRuleViolationCount: 0,
    affinity: { averageAffinity: 0.7, lowestAffinity: 0.5, lowestAffinityPair: ['oracle', 'atlas'] },
    summaries: [],
    messages: [],
    metadata: {},
    ...overrides,
  } as ConversationState;
}

describe('estimateTokens', () => {
  test('estimates tokens using chars-per-token ratio', () => {
    expect(estimateTokens('Hello world', 4)).toBe(3); // 11 chars / 4 = 2.75 -> 3
    expect(estimateTokens('a', 4)).toBe(1); // min 1
    expect(estimateTokens('', 4)).toBe(1); // min 1
  });

  test('handles edge cases', () => {
    expect(estimateTokens('test', 0)).toBe(4); // charsPerToken clamped to 1
    expect(estimateTokens('test', -1)).toBe(4); // charsPerToken clamped to 1
    expect(estimateTokens('a'.repeat(1000), 4)).toBe(250);
  });
});

describe('TokenCounterHook', () => {
  // ─── Attach / Detach ──────────────────────────────────────────────

  test('attach registers event listener on ConversationAPI', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store);
    hook.attach(api);

    expect(hook.isActive()).toBe(true);
    expect(api.listenerCount('message')).toBe(1);

    hook.detach();
    expect(hook.isActive()).toBe(false);
    expect(api.listenerCount('message')).toBe(0);
  });

  test('attach with enabled=false does not register listener', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { enabled: false });
    hook.attach(api);

    expect(hook.isActive()).toBe(false);
    expect(api.listenerCount('message')).toBe(0);
    hook.detach();
  });

  test('re-attach detaches from previous API', () => {
    const api1 = createMockApi();
    const api2 = createMockApi();
    const hook = new TokenCounterHook(store);

    hook.attach(api1);
    expect(api1.listenerCount('message')).toBe(1);

    hook.attach(api2);
    expect(api1.listenerCount('message')).toBe(0);
    expect(api2.listenerCount('message')).toBe(1);

    hook.detach();
  });

  // ─── Event Handling ───────────────────────────────────────────────

  test('writes token_usage observation when message event fires', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    const msg = makeMessage({ content: 'Hello world test' });
    const state = makeState();
    api.emit('message', { message: msg, state });

    const observations = store.query({ category: 'token_usage' });
    expect(observations).toHaveLength(1);
    expect(observations[0].source.agentId).toBe('oracle');
    expect(observations[0].source.conversationId).toBe('conv-test-1');
    expect(observations[0].source.messageId).toBe(msg.messageId);
    expect(observations[0].tokenUsage).toBeDefined();
    expect(observations[0].tokenUsage!.totalTokens).toBeGreaterThan(0);
    expect(observations[0].status).toBe('pending');

    hook.detach();
  });

  test('skips blocked messages', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    const msg = makeMessage({ status: 'blocked' });
    api.emit('message', { message: msg, state: makeState() });

    const observations = store.query({ category: 'token_usage' });
    expect(observations).toHaveLength(0);

    const metrics = hook.getMetrics();
    expect(metrics.messagesObserved).toBe(1);
    expect(metrics.observationsWritten).toBe(0);

    hook.detach();
  });

  test('skips rejected messages', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    const msg = makeMessage({ status: 'rejected' });
    api.emit('message', { message: msg, state: makeState() });

    expect(store.query({ category: 'token_usage' })).toHaveLength(0);
    hook.detach();
  });

  test('correctly estimates tokens using configured charsPerToken', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { charsPerToken: 2, silent: true });
    hook.attach(api);

    // 20 chars -> 10 tokens input, 10 output -> 20 total
    const msg = makeMessage({ content: 'abcdefghijklmnopqrst' }); // 20 chars
    api.emit('message', { message: msg, state: makeState() });

    const obs = store.query({ category: 'token_usage' });
    expect(obs).toHaveLength(1);
    expect(obs[0].tokenUsage!.inputTokens).toBe(10);
    expect(obs[0].tokenUsage!.outputTokens).toBe(10);
    expect(obs[0].tokenUsage!.totalTokens).toBe(20);

    hook.detach();
  });

  test('includes model name when configured', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, {
      defaultModel: 'claude-3-opus',
      silent: true,
    });
    hook.attach(api);

    api.emit('message', { message: makeMessage(), state: makeState() });

    const obs = store.query({ category: 'token_usage' });
    expect(obs[0].tokenUsage!.model).toBe('claude-3-opus');

    hook.detach();
  });

  test('calculates cost when costPerToken is configured', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, {
      costPerToken: 0.0001,
      silent: true,
    });
    hook.attach(api);

    // 48 chars / 4 charsPerToken = 12 input tokens -> 24 total tokens -> $0.0024
    const msg = makeMessage({ content: 'a'.repeat(48) });
    api.emit('message', { message: msg, state: makeState() });

    const obs = store.query({ category: 'token_usage' });
    expect(obs[0].tokenUsage!.estimatedCostUsd).toBeCloseTo(0.0024, 5);

    hook.detach();
  });

  test('does not calculate cost when costPerToken is not set', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    api.emit('message', { message: makeMessage(), state: makeState() });

    const obs = store.query({ category: 'token_usage' });
    expect(obs[0].tokenUsage!.estimatedCostUsd).toBeUndefined();

    hook.detach();
  });

  // ─── Metrics ──────────────────────────────────────────────────────

  test('getMetrics tracks all counters correctly', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    // Initial state
    let m = hook.getMetrics();
    expect(m.messagesObserved).toBe(0);
    expect(m.observationsWritten).toBe(0);
    expect(m.totalTokensCounted).toBe(0);
    expect(m.errors).toBe(0);
    expect(m.lastWriteAt).toBeNull();

    // Delivered message
    api.emit('message', { message: makeMessage(), state: makeState() });

    m = hook.getMetrics();
    expect(m.messagesObserved).toBe(1);
    expect(m.observationsWritten).toBe(1);
    expect(m.totalTokensCounted).toBeGreaterThan(0);
    expect(m.lastWriteAt).toBeTruthy();

    // Blocked message (observed but not written)
    api.emit('message', {
      message: makeMessage({ status: 'blocked' }),
      state: makeState(),
    });

    m = hook.getMetrics();
    expect(m.messagesObserved).toBe(2);
    expect(m.observationsWritten).toBe(1); // Still 1

    hook.detach();
  });

  test('getMetrics returns a copy (not a reference)', () => {
    const hook = new TokenCounterHook(store, { silent: true });
    const m1 = hook.getMetrics();
    const m2 = hook.getMetrics();
    expect(m1).not.toBe(m2);
    expect(m1).toEqual(m2);
  });

  // ─── Error Handling ───────────────────────────────────────────────

  test('gracefully handles store errors without throwing', () => {
    const api = createMockApi();
    // Create a hook with a store that will be closed (simulating error)
    const badStore = new ObservationStore(dbPath);
    const hook = new TokenCounterHook(badStore, { silent: true });
    hook.attach(api);

    // Close the store to simulate error
    badStore.close();

    // Should not throw
    expect(() => {
      api.emit('message', { message: makeMessage(), state: makeState() });
    }).not.toThrow();

    const m = hook.getMetrics();
    expect(m.errors).toBe(1);
    expect(m.lastErrorAt).toBeTruthy();

    hook.detach();
  });

  // ─── Direct Invocation ────────────────────────────────────────────

  test('recordTokenUsage can be called directly', () => {
    const hook = new TokenCounterHook(store, { silent: true });

    const msg = makeMessage({ content: 'Direct invocation test' });
    hook.recordTokenUsage(msg, makeState());

    const obs = store.query({ category: 'token_usage' });
    expect(obs).toHaveLength(1);
    expect(obs[0].content).toContain('tokens');
    expect(obs[0].source.messageId).toBe(msg.messageId);

    const m = hook.getMetrics();
    expect(m.observationsWritten).toBe(1);
  });

  // ─── Multiple Messages ───────────────────────────────────────────

  test('handles multiple messages in sequence', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    for (let i = 0; i < 10; i++) {
      api.emit('message', {
        message: makeMessage({
          messageId: `msg-seq-${i}`,
          from: i % 2 === 0 ? 'oracle' : 'atlas',
          content: `Message number ${i}`,
        }),
        state: makeState(),
      });
    }

    const obs = store.query({ limit: 100 });
    expect(obs).toHaveLength(10);

    const m = hook.getMetrics();
    expect(m.messagesObserved).toBe(10);
    expect(m.observationsWritten).toBe(10);

    hook.detach();
  });

  // ─── Content of Observation ───────────────────────────────────────

  test('observation content includes agent name and token counts', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    const msg = makeMessage({ from: 'sentinel' });
    api.emit('message', { message: msg, state: makeState() });

    const obs = store.query({ category: 'token_usage' });
    expect(obs[0].content).toContain('sentinel');
    expect(obs[0].content).toContain('tokens');

    hook.detach();
  });

  test('observation metadata includes deliveredTo and messageStatus', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { silent: true });
    hook.attach(api);

    const msg = makeMessage({ deliveredTo: ['atlas', 'sentinel'] });
    api.emit('message', { message: msg, state: makeState() });

    const obs = store.query({ category: 'token_usage' });
    expect(obs[0].metadata).toEqual({
      deliveredTo: ['atlas', 'sentinel'],
      messageStatus: 'delivered',
    });

    hook.detach();
  });

  // ─── Integration with ObservationStore token summary ──────────────

  test('token observations are aggregated by ObservationStore.getTokenUsageSummary', () => {
    const api = createMockApi();
    const hook = new TokenCounterHook(store, { charsPerToken: 4, silent: true });
    hook.attach(api);

    // Send 3 messages with known content lengths
    const contents = ['a'.repeat(40), 'b'.repeat(80), 'c'.repeat(20)];
    for (const content of contents) {
      api.emit('message', {
        message: makeMessage({ content, messageId: `msg-${content[0]}` }),
        state: makeState(),
      });
    }

    const summary = store.getTokenUsageSummary();
    // 40/4=10, 80/4=20, 20/4=5 -> input = 35, output = 35, total = 70
    expect(summary.totalInputTokens).toBe(35);
    expect(summary.totalOutputTokens).toBe(35);
    expect(summary.totalTokens).toBe(70);
    expect(summary.observationCount).toBe(3);

    hook.detach();
  });
});
