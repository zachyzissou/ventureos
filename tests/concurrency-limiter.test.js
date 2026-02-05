'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ConcurrencyLimiter } = require('../concurrency-limiter');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('enforces per-provider limits', async () => {
  const limiter = new ConcurrencyLimiter({ maxQueue: 10 });
  const release1 = await limiter.requestSlot('anthropic');
  const release2 = await limiter.requestSlot('anthropic');
  const release3 = await limiter.requestSlot('anthropic');

  let granted = false;
  const p = limiter.requestSlot('anthropic').then((release) => {
    granted = true;
    release();
  });

  await sleep(50);
  assert.strictEqual(granted, false, 'should not grant beyond limit');

  release1();
  await p;

  release2();
  release3();
});

test('ollama limit is 2', async () => {
  const limiter = new ConcurrencyLimiter();
  const r1 = await limiter.requestSlot('ollama');
  const r2 = await limiter.requestSlot('ollama');

  let granted = false;
  const p = limiter.requestSlot('ollama').then((release) => {
    granted = true;
    release();
  });
  await sleep(50);
  assert.strictEqual(granted, false);
  r1();
  await p;
  r2();
});

test('priority queueing works', async () => {
  const limiter = new ConcurrencyLimiter({ maxQueue: 10 });
  const r1 = await limiter.requestSlot('google-gemini-cli');
  const r2 = await limiter.requestSlot('google-gemini-cli');
  const r3 = await limiter.requestSlot('google-gemini-cli');

  const order = [];
  const low = limiter.requestSlot('google-gemini-cli', { priority: 1 }).then((release) => {
    order.push('low');
    release();
  });
  const high = limiter.requestSlot('google-gemini-cli', { priority: 10 }).then((release) => {
    order.push('high');
    release();
  });

  r1();
  await sleep(20);
  assert.deepStrictEqual(order, ['high']);

  r2();
  await sleep(20);
  assert.deepStrictEqual(order, ['high', 'low']);

  r3();
  await Promise.all([low, high]);
});

test('timeouts reject and update metrics', async () => {
  const limiter = new ConcurrencyLimiter({ maxQueue: 10 });
  const r1 = await limiter.requestSlot('openai-codex');
  const r2 = await limiter.requestSlot('openai-codex');
  const r3 = await limiter.requestSlot('openai-codex');

  await assert.rejects(
    limiter.requestSlot('openai-codex', { timeoutMs: 50 }),
    /Timed out/
  );

  const metrics = limiter.getMetrics();
  assert.strictEqual(metrics['openai-codex'].timedOut, 1);
  assert.strictEqual(metrics['openai-codex'].rejected, 1);

  r1(); r2(); r3();
});

test('queue overflow rejects', async () => {
  const limiter = new ConcurrencyLimiter({ maxQueue: 1 });
  const r1 = await limiter.requestSlot('anthropic');
  const r2 = await limiter.requestSlot('anthropic');
  const r3 = await limiter.requestSlot('anthropic');

  await limiter.requestSlot('anthropic', { priority: 1 });

  await assert.rejects(
    limiter.requestSlot('anthropic', { priority: 1 }),
    /Queue overflow/
  );

  r1(); r2(); r3();
});
