'use strict';

const { recordMetrics } = require('./metrics');

const GEN_AI_ATTRS = {
  SYSTEM: 'gen_ai.system',
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  REQUEST_TOP_P: 'gen_ai.request.top_p',
  REQUEST_TOP_K: 'gen_ai.request.top_k',
  REQUEST_SEED: 'gen_ai.request.seed',
  RESPONSE_MODEL: 'gen_ai.response.model',
  RESPONSE_FINISH_REASON: 'gen_ai.response.finish_reason',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',
  OPERATION: 'gen_ai.operation',
  SUCCESS: 'gen_ai.success',
  ERROR_TYPE: 'error.type',
};

function extractUsage(payload = {}) {
  const usage = payload.usage || payload.tokenUsage || payload.tokens || {};
  const inputTokens =
    usage.input_tokens ??
    usage.prompt_tokens ??
    usage.input ??
    payload.inputTokens ??
    null;
  const outputTokens =
    usage.output_tokens ??
    usage.completion_tokens ??
    usage.output ??
    payload.outputTokens ??
    null;
  const totalTokens =
    usage.total_tokens ??
    usage.total ??
    (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null);

  return { inputTokens, outputTokens, totalTokens };
}

function normalizeErrorType(err) {
  if (!err) return 'unknown';
  if (err.name) return err.name;
  if (typeof err === 'string') return err;
  return 'error';
}

function createTelemetryMiddleware({ tracer, metrics, limiter }) {
  const telemetryTracer = tracer;
  const prometheus = metrics?.prometheus || metrics?.prometheusMetrics || metrics;
  const otelMetrics = metrics?.otelMetrics || metrics?.otel;

  /**
   * Wraps a provider call with tracing + metrics + concurrency control.
   *
   * @param {Object} options
   * @param {string} options.provider
   * @param {string} options.model
   * @param {string} [options.operation='completion']
   * @param {Function} options.call - async function returning provider response
   * @param {Object} [options.request] - request payload for attributes
   * @param {Object} [options.response] - optional response payload override
   * @param {number} [options.cost] - USD cost (optional)
   * @param {Object} [options.metadata] - extra span attributes
   * @param {Object} [options.limiterOptions] - concurrency limiter options
   */
  return async function wrapProviderCall(options) {
    const {
      provider,
      model,
      operation = 'completion',
      call,
      request = {},
      response: responseOverride,
      cost,
      metadata = {},
      limiterOptions = {},
    } = options;

    if (typeof call !== 'function') {
      throw new Error('wrapProviderCall requires a call() function');
    }

    const startTime = Date.now();
    let release = null;
    if (limiter && typeof limiter.requestSlot === 'function') {
      release = await limiter.requestSlot(provider, limiterOptions);
    }

    const span = telemetryTracer?.startSpan('llm.call', {
      attributes: {
        [GEN_AI_ATTRS.SYSTEM]: provider,
        [GEN_AI_ATTRS.REQUEST_MODEL]: model,
        [GEN_AI_ATTRS.OPERATION]: operation,
        ...metadata,
      },
    });

    if (request?.temperature != null) span.setAttribute(GEN_AI_ATTRS.REQUEST_TEMPERATURE, request.temperature);
    if (request?.max_tokens != null) span.setAttribute(GEN_AI_ATTRS.REQUEST_MAX_TOKENS, request.max_tokens);
    if (request?.top_p != null) span.setAttribute(GEN_AI_ATTRS.REQUEST_TOP_P, request.top_p);
    if (request?.top_k != null) span.setAttribute(GEN_AI_ATTRS.REQUEST_TOP_K, request.top_k);
    if (request?.seed != null) span.setAttribute(GEN_AI_ATTRS.REQUEST_SEED, request.seed);

    let result;
    let error;
    try {
      result = await call();
      return result;
    } catch (err) {
      error = err;
      span?.recordException?.(err);
      span?.setAttribute(GEN_AI_ATTRS.ERROR_TYPE, normalizeErrorType(err));
      throw err;
    } finally {
      const endTime = Date.now();
      const latencyMs = endTime - startTime;
      const response = responseOverride || result || {};
      const { inputTokens, outputTokens, totalTokens } = extractUsage(response);
      const status = error ? 'error' : 'success';

      span?.setAttribute(GEN_AI_ATTRS.SUCCESS, !error);
      if (response?.model) span?.setAttribute(GEN_AI_ATTRS.RESPONSE_MODEL, response.model);
      if (response?.finish_reason) span?.setAttribute(GEN_AI_ATTRS.RESPONSE_FINISH_REASON, response.finish_reason);
      if (inputTokens != null) span?.setAttribute(GEN_AI_ATTRS.USAGE_INPUT_TOKENS, inputTokens);
      if (outputTokens != null) span?.setAttribute(GEN_AI_ATTRS.USAGE_OUTPUT_TOKENS, outputTokens);
      if (totalTokens != null) span?.setAttribute(GEN_AI_ATTRS.USAGE_TOTAL_TOKENS, totalTokens);

      recordMetrics({
        prometheus,
        otel: otelMetrics,
        provider,
        model,
        operation,
        status,
        latencyMs,
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        errorType: normalizeErrorType(error),
      });

      span?.end?.();
      if (release) release();
    }
  };
}

module.exports = {
  createTelemetryMiddleware,
  GEN_AI_ATTRS,
};
