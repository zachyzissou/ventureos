'use strict';

const { initTracing } = require('./tracing');
const { createPrometheusMetrics, createOtelMetrics } = require('./metrics');
const { createTelemetryMiddleware } = require('./middleware');

/**
 * Initialize telemetry (tracing + metrics) for the orchestration system.
 *
 * Usage:
 * const { createTelemetry } = require('./telemetry');
 * const limiter = new ConcurrencyLimiter({ maxQueue: 100 });
 * const telemetry = createTelemetry({ limiter });
 *
 * const callModel = telemetry.wrapProviderCall({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet',
 *   operation: 'chat',
 *   request: { temperature: 0.2, max_tokens: 1024 },
 *   call: () => anthropicClient.chat(...),
 *   cost: 0.012,
 * });
 */
function createTelemetry(options = {}) {
  const {
    tracing = {},
    prometheus = {},
    limiter = null,
  } = options;

  const tracingState = initTracing(tracing);
  const prometheusMetrics = createPrometheusMetrics(prometheus);
  const otelMetrics = createOtelMetrics(tracingState.meter);

  const wrapProviderCall = createTelemetryMiddleware({
    tracer: tracingState.tracer,
    metrics: { prometheus: prometheusMetrics, otel: otelMetrics },
    limiter,
  });

  return {
    tracing: tracingState,
    metrics: {
      prometheus: prometheusMetrics,
      otel: otelMetrics,
    },
    wrapProviderCall,
    shutdown: tracingState.shutdown,
  };
}

module.exports = {
  createTelemetry,
  createTelemetryMiddleware,
};
