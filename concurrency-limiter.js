'use strict';

const { EventEmitter } = require('events');

/**
 * Production-ready concurrency limiter with per-provider semaphores,
 * priority queueing, timeouts, and observability hooks.
 */
class ConcurrencyLimiter extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {Object<string, number>} [options.limits] - provider -> max concurrent
   * @param {number} [options.defaultLimit=3]
   * @param {number} [options.ollamaLimit=2]
   * @param {number} [options.maxQueue=Infinity] - max queue length per provider
   * @param {Function} [options.onEvent] - callback for events
   */
  constructor(options = {}) {
    super();
    const {
      limits = {},
      defaultLimit = 3,
      ollamaLimit = 2,
      maxQueue = Infinity,
      onEvent,
    } = options;

    this._limits = {
      anthropic: defaultLimit,
      'openai-codex': defaultLimit,
      'google-gemini-cli': defaultLimit,
      ollama: ollamaLimit,
      ...limits,
    };

    this._maxQueue = maxQueue;
    this._state = new Map();
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;

    // initialize state for known providers
    Object.keys(this._limits).forEach((provider) => {
      this._state.set(provider, this._createProviderState());
    });
  }

  _createProviderState() {
    return {
      active: 0,
      queue: [],
      metrics: {
        queueDepth: 0,
        totalWaitMs: 0,
        maxWaitMs: 0,
        granted: 0,
        rejected: 0,
        timedOut: 0,
        aborted: 0,
      },
    };
  }

  _emit(event, payload) {
    this.emit(event, payload);
    if (this._onEvent) {
      try {
        this._onEvent(event, payload);
      } catch (err) {
        // avoid crashing limiter if observability hook fails
      }
    }
  }

  _getState(provider) {
    if (!this._state.has(provider)) {
      this._state.set(provider, this._createProviderState());
      if (!this._limits[provider]) this._limits[provider] = 3;
    }
    return this._state.get(provider);
  }

  /**
   * Request a concurrency slot. Resolves with a release() function when granted.
   * @param {string} provider
   * @param {Object} [options]
   * @param {number} [options.priority=0] - higher value = higher priority
   * @param {number} [options.timeoutMs] - max time to wait in queue
   * @param {AbortSignal} [options.signal] - abort waiting
   * @returns {Promise<Function>} release function
   */
  requestSlot(provider, options = {}) {
    const { priority = 0, timeoutMs, signal } = options;
    const state = this._getState(provider);
    const limit = this._limits[provider] ?? 3;

    if (state.active < limit) {
      state.active += 1;
      state.metrics.granted += 1;
      this._emit('granted', { provider, queued: false });
      return Promise.resolve(this._createRelease(provider));
    }

    if (state.queue.length >= this._maxQueue) {
      state.metrics.rejected += 1;
      this._emit('rejected', { provider, reason: 'queue_overflow' });
      return Promise.reject(new Error(`Queue overflow for provider: ${provider}`));
    }

    return new Promise((resolve, reject) => {
      const enqueuedAt = Date.now();
      const entry = {
        provider,
        priority,
        enqueuedAt,
        resolve,
        reject,
        timeoutId: null,
        aborted: false,
        signal,
      };

      // insert by priority (desc), then FIFO by enqueuedAt
      const idx = state.queue.findIndex(
        (q) => q.priority < priority
      );
      if (idx === -1) state.queue.push(entry);
      else state.queue.splice(idx, 0, entry);

      state.metrics.queueDepth = state.queue.length;
      this._emit('queued', { provider, priority, queueDepth: state.queue.length });

      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        entry.timeoutId = setTimeout(() => {
          this._dequeue(provider, entry, 'timeout');
        }, timeoutMs);
      }

      if (signal) {
        if (signal.aborted) {
          this._dequeue(provider, entry, 'abort');
        } else {
          const onAbort = () => this._dequeue(provider, entry, 'abort');
          signal.addEventListener('abort', onAbort, { once: true });
          entry._onAbort = onAbort;
        }
      }
    });
  }

  _dequeue(provider, entry, reason) {
    const state = this._getState(provider);
    const idx = state.queue.indexOf(entry);
    if (idx === -1) return; // already granted or removed

    state.queue.splice(idx, 1);
    state.metrics.queueDepth = state.queue.length;

    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    if (entry.signal && entry._onAbort) {
      try {
        entry.signal.removeEventListener('abort', entry._onAbort);
      } catch (_) {}
    }

    if (reason === 'timeout') {
      state.metrics.timedOut += 1;
      state.metrics.rejected += 1;
      this._emit('rejected', { provider, reason: 'timeout' });
      entry.reject(new Error(`Timed out waiting for slot: ${provider}`));
      return;
    }

    if (reason === 'abort') {
      state.metrics.aborted += 1;
      state.metrics.rejected += 1;
      this._emit('rejected', { provider, reason: 'aborted' });
      entry.reject(new Error(`Aborted waiting for slot: ${provider}`));
      return;
    }
  }

  _createRelease(provider) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const state = this._getState(provider);
      state.active = Math.max(0, state.active - 1);
      this._emit('released', { provider });
      this._drainQueue(provider);
    };
  }

  _drainQueue(provider) {
    const state = this._getState(provider);
    const limit = this._limits[provider] ?? 3;

    while (state.active < limit && state.queue.length > 0) {
      const entry = state.queue.shift();
      state.metrics.queueDepth = state.queue.length;
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
      if (entry.signal && entry._onAbort) {
        try {
          entry.signal.removeEventListener('abort', entry._onAbort);
        } catch (_) {}
      }

      const waitMs = Date.now() - entry.enqueuedAt;
      state.metrics.totalWaitMs += waitMs;
      state.metrics.maxWaitMs = Math.max(state.metrics.maxWaitMs, waitMs);
      state.metrics.granted += 1;
      state.active += 1;
      this._emit('granted', { provider, queued: true, waitMs });
      entry.resolve(this._createRelease(provider));
    }
  }

  /**
   * Get metrics snapshot
   * @returns {Object}
   */
  getMetrics() {
    const out = {};
    for (const [provider, state] of this._state.entries()) {
      const avgWaitMs = state.metrics.granted
        ? Math.round(state.metrics.totalWaitMs / state.metrics.granted)
        : 0;
      out[provider] = {
        active: state.active,
        queueDepth: state.metrics.queueDepth,
        granted: state.metrics.granted,
        rejected: state.metrics.rejected,
        timedOut: state.metrics.timedOut,
        aborted: state.metrics.aborted,
        avgWaitMs,
        maxWaitMs: state.metrics.maxWaitMs,
      };
    }
    return out;
  }
}

module.exports = { ConcurrencyLimiter };

/**
 * Usage Example:
 *
 * const { ConcurrencyLimiter } = require('./concurrency-limiter');
 * const limiter = new ConcurrencyLimiter({
 *   maxQueue: 100,
 *   onEvent: (event, payload) => console.log(event, payload),
 * });
 *
 * async function runTask(provider) {
 *   const release = await limiter.requestSlot(provider, { priority: 10, timeoutMs: 5000 });
 *   try {
 *     // ... do work
 *   } finally {
 *     release();
 *   }
 * }
 */
