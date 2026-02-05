'use strict';

/**
 * Prometheus + OpenTelemetry metric definitions for model orchestration.
 *
 * This module provides a light wrapper around prom-client. If prom-client
 * is not available, it falls back to a minimal in-memory implementation so
 * tests and local development can run without external deps.
 */

let promClient = null;
try {
  // Optional dependency.
  // eslint-disable-next-line import/no-extraneous-dependencies
  promClient = require('prom-client');
} catch (_) {
  promClient = null;
}

class InMemoryRegistry {
  constructor() {
    this._metrics = [];
  }
  registerMetric(metric) {
    this._metrics.push(metric);
  }
  getMetricsAsJSON() {
    return this._metrics.map((metric) => metric.toJSON());
  }
}

class InMemoryMetric {
  constructor({ name, help, labelNames = [], type }) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.type = type;
    this._values = new Map();
  }

  _labelKey(labels = {}) {
    return JSON.stringify(labels);
  }

  _getLabelValue(labels = {}) {
    const key = this._labelKey(labels);
    if (!this._values.has(key)) {
      this._values.set(key, { labels, value: 0, sum: 0, count: 0 });
    }
    return this._values.get(key);
  }

  toJSON() {
    const values = Array.from(this._values.values()).map((entry) => {
      if (this.type === 'histogram') {
        return {
          labels: entry.labels,
          value: entry.sum,
          count: entry.count,
        };
      }
      return { labels: entry.labels, value: entry.value };
    });
    return { name: this.name, help: this.help, type: this.type, values };
  }
}

class InMemoryCounter extends InMemoryMetric {
  constructor(opts) {
    super({ ...opts, type: 'counter' });
  }
  inc(labels, value = 1) {
    if (typeof labels === 'number') {
      value = labels;
      labels = {};
    }
    const entry = this._getLabelValue(labels);
    entry.value += value;
  }
}

class InMemoryGauge extends InMemoryMetric {
  constructor(opts) {
    super({ ...opts, type: 'gauge' });
  }
  set(labels, value) {
    if (typeof labels === 'number') {
      value = labels;
      labels = {};
    }
    const entry = this._getLabelValue(labels);
    entry.value = value;
  }
}

class InMemoryHistogram extends InMemoryMetric {
  constructor(opts) {
    super({ ...opts, type: 'histogram' });
  }
  observe(labels, value) {
    if (typeof labels === 'number') {
      value = labels;
      labels = {};
    }
    const entry = this._getLabelValue(labels);
    entry.sum += value;
    entry.count += 1;
  }
}

function createPrometheusMetrics(options = {}) {
  const {
    register = promClient?.register || new InMemoryRegistry(),
    labelNames = ['provider', 'model', 'operation', 'status'],
  } = options;

  const MetricCounter = promClient?.Counter || InMemoryCounter;
  const MetricGauge = promClient?.Gauge || InMemoryGauge;
  const MetricHistogram = promClient?.Histogram || InMemoryHistogram;

  const requestCount = new MetricCounter({
    name: 'clawdbot_model_requests_total',
    help: 'Total model requests',
    labelNames,
    registers: promClient ? [register] : undefined,
  });

  const latencyHistogram = new MetricHistogram({
    name: 'clawdbot_model_latency_ms',
    help: 'Model request latency (ms)',
    labelNames,
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000],
    registers: promClient ? [register] : undefined,
  });

  const tokenGauge = new MetricGauge({
    name: 'clawdbot_token_usage',
    help: 'Most recent token usage for a model call',
    labelNames: ['provider', 'model', 'direction'],
    registers: promClient ? [register] : undefined,
  });

  const tokenCounter = new MetricCounter({
    name: 'clawdbot_tokens_total',
    help: 'Total tokens consumed',
    labelNames: ['provider', 'model', 'direction'],
    registers: promClient ? [register] : undefined,
  });

  const costCounter = new MetricCounter({
    name: 'clawdbot_cost_total',
    help: 'Total cost in USD',
    labelNames: ['provider', 'model'],
    registers: promClient ? [register] : undefined,
  });

  const successCounter = new MetricCounter({
    name: 'clawdbot_model_success_total',
    help: 'Total successful model calls',
    labelNames: ['provider', 'model', 'operation'],
    registers: promClient ? [register] : undefined,
  });

  const errorCounter = new MetricCounter({
    name: 'clawdbot_model_errors_total',
    help: 'Total failed model calls',
    labelNames: ['provider', 'model', 'operation', 'error_type'],
    registers: promClient ? [register] : undefined,
  });

  if (!promClient) {
    register.registerMetric(requestCount);
    register.registerMetric(latencyHistogram);
    register.registerMetric(tokenGauge);
    register.registerMetric(tokenCounter);
    register.registerMetric(costCounter);
    register.registerMetric(successCounter);
    register.registerMetric(errorCounter);
  }

  const getSnapshot = async () => {
    if (typeof register.getMetricsAsJSON === 'function') {
      return await register.getMetricsAsJSON();
    }
    return [];
  };

  return {
    register,
    requestCount,
    latencyHistogram,
    tokenGauge,
    tokenCounter,
    costCounter,
    successCounter,
    errorCounter,
    getSnapshot,
  };
}

function createOtelMetrics(meter) {
  if (!meter) return null;

  return {
    requestCount: meter.createCounter('clawdbot.model.requests', {
      description: 'Total model requests',
    }),
    latencyHistogram: meter.createHistogram('clawdbot.model.latency_ms', {
      description: 'Model request latency (ms)',
      unit: 'ms',
    }),
    tokenCounter: meter.createCounter('clawdbot.model.tokens', {
      description: 'Total tokens consumed',
    }),
    costCounter: meter.createCounter('clawdbot.model.cost_usd', {
      description: 'Total model cost in USD',
      unit: 'USD',
    }),
    successCounter: meter.createCounter('clawdbot.model.success', {
      description: 'Total successful model calls',
    }),
    errorCounter: meter.createCounter('clawdbot.model.errors', {
      description: 'Total failed model calls',
    }),
  };
}

function recordMetrics({
  prometheus,
  otel,
  provider,
  model,
  operation,
  status,
  latencyMs,
  inputTokens,
  outputTokens,
  totalTokens,
  cost,
  errorType,
}) {
  if (prometheus) {
    const labels = { provider, model, operation, status };
    prometheus.requestCount.inc(labels, 1);
    prometheus.latencyHistogram.observe(labels, latencyMs);
    if (inputTokens != null) {
      prometheus.tokenGauge.set({ provider, model, direction: 'input' }, inputTokens);
      prometheus.tokenCounter.inc({ provider, model, direction: 'input' }, inputTokens);
    }
    if (outputTokens != null) {
      prometheus.tokenGauge.set({ provider, model, direction: 'output' }, outputTokens);
      prometheus.tokenCounter.inc({ provider, model, direction: 'output' }, outputTokens);
    }
    if (totalTokens != null) {
      prometheus.tokenGauge.set({ provider, model, direction: 'total' }, totalTokens);
      prometheus.tokenCounter.inc({ provider, model, direction: 'total' }, totalTokens);
    }
    if (cost != null) {
      prometheus.costCounter.inc({ provider, model }, cost);
    }
    if (status === 'success') {
      prometheus.successCounter.inc({ provider, model, operation }, 1);
    } else {
      prometheus.errorCounter.inc(
        { provider, model, operation, error_type: errorType || 'unknown' },
        1
      );
    }
  }

  if (otel) {
    const attrs = { provider, model, operation, status };
    otel.requestCount.add(1, attrs);
    otel.latencyHistogram.record(latencyMs, attrs);
    if (inputTokens != null) otel.tokenCounter.add(inputTokens, { ...attrs, direction: 'input' });
    if (outputTokens != null) otel.tokenCounter.add(outputTokens, { ...attrs, direction: 'output' });
    if (totalTokens != null) otel.tokenCounter.add(totalTokens, { ...attrs, direction: 'total' });
    if (cost != null) otel.costCounter.add(cost, attrs);
    if (status === 'success') otel.successCounter.add(1, attrs);
    else otel.errorCounter.add(1, { ...attrs, error_type: errorType || 'unknown' });
  }
}

module.exports = {
  createPrometheusMetrics,
  createOtelMetrics,
  recordMetrics,
};
