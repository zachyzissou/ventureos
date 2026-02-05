'use strict';

/**
 * OpenTelemetry tracing + metrics initialization.
 *
 * Supports console + OTLP exporters. Falls back to a no-op tracer/meter
 * if OpenTelemetry packages are not installed.
 */

let otelApi = null;
let NodeSDK = null;
let Resource = null;
let semanticConventions = null;
let ConsoleSpanExporter = null;
let BatchSpanProcessor = null;
let OTLPTraceExporter = null;
let PeriodicExportingMetricReader = null;
let ConsoleMetricExporter = null;
let OTLPMetricExporter = null;

try {
  otelApi = require('@opentelemetry/api');
  ({ NodeSDK } = require('@opentelemetry/sdk-node'));
  ({ Resource } = require('@opentelemetry/resources'));
  semanticConventions = require('@opentelemetry/semantic-conventions');
  ({ ConsoleSpanExporter, BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base'));
  ({ OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http'));
  ({
    PeriodicExportingMetricReader,
    ConsoleMetricExporter,
  } = require('@opentelemetry/sdk-metrics'));
  ({ OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http'));
} catch (_) {
  // optional dependency not installed
}

const NOOP_SPAN = {
  setAttribute() {},
  setAttributes() {},
  addEvent() {},
  recordException() {},
  setStatus() {},
  end() {},
};

function createNoopTracer() {
  return {
    startSpan() {
      return NOOP_SPAN;
    },
  };
}

function createNoopMeter() {
  const noopMetric = {
    add() {},
    record() {},
  };
  return {
    createCounter: () => noopMetric,
    createHistogram: () => noopMetric,
  };
}

function initTracing(options = {}) {
  if (!otelApi || !NodeSDK) {
    return {
      sdk: null,
      tracer: createNoopTracer(),
      meter: createNoopMeter(),
      shutdown: async () => {},
      semantic: {},
    };
  }

  const {
    serviceName = 'clawdbot-orchestrator',
    serviceVersion,
    environment = process.env.NODE_ENV || 'development',
    traceExporter = process.env.OTEL_EXPORTER || 'console',
    metricExporter = process.env.OTEL_METRIC_EXPORTER || null,
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  } = options;

  const resourceAttributes = {
    [semanticConventions.SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [semanticConventions.SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [semanticConventions.SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
  };

  const resource = new Resource(resourceAttributes);

  let spanExporter = null;
  if (traceExporter === 'otlp') {
    spanExporter = new OTLPTraceExporter({ url: otlpEndpoint });
  } else if (traceExporter === 'console') {
    spanExporter = new ConsoleSpanExporter();
  }

  const spanProcessor = spanExporter ? new BatchSpanProcessor(spanExporter) : null;

  let metricReader = null;
  if (metricExporter === 'otlp') {
    metricReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: otlpEndpoint }),
      exportIntervalMillis: 5000,
    });
  } else if (metricExporter === 'console') {
    metricReader = new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
      exportIntervalMillis: 5000,
    });
  }

  const sdk = new NodeSDK({
    resource,
    spanProcessor,
    metricReader,
  });

  sdk.start();

  return {
    sdk,
    tracer: otelApi.trace.getTracer('clawdbot-orchestrator'),
    meter: otelApi.metrics.getMeter('clawdbot-orchestrator'),
    shutdown: async () => sdk.shutdown(),
    semantic: semanticConventions,
  };
}

module.exports = {
  initTracing,
};
