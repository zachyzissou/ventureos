#!/usr/bin/env node
// Context Window Validator & Safeguard System
// Prevents the 131K context bug from happening again

const fs = require('fs');
const path = require('path');

const SPECS_FILE = path.join(__dirname, 'MODEL-SPECS.json');
const specs = JSON.parse(fs.readFileSync(SPECS_FILE, 'utf8'));

/**
 * Validate and adjust context size for a given model
 * @param {string} modelName - e.g., "qwen3:8b", "claude-sonnet-4-5"
 * @param {number} requestedContext - Requested context window size
 * @returns {object} - { contextSize, warning, error }
 */
function validateContext(modelName, requestedContext) {
  const model = specs.models[modelName];
  
  if (!model) {
    return {
      contextSize: null,
      error: `Unknown model: ${modelName}. Add to MODEL-SPECS.json first.`
    };
  }
  
  // Hard limit: Never exceed trained context
  if (requestedContext > model.trained_context) {
    return {
      contextSize: model.safe_context,
      error: `REJECTED: ${requestedContext} exceeds ${modelName} trained context (${model.trained_context}). Auto-reduced to ${model.safe_context}.`,
      autoReduced: true
    };
  }
  
  // Soft warning: Above safe threshold
  if (requestedContext > model.safe_context) {
    return {
      contextSize: requestedContext,
      warning: `WARNING: ${requestedContext} is above safe context (${model.safe_context}) for ${modelName}. Performance may degrade.`
    };
  }
  
  // All good
  return {
    contextSize: requestedContext,
    status: 'ok'
  };
}

/**
 * Get recommended context for a model and task type
 * @param {string} modelName
 * @param {string} taskType - "monitoring", "extraction", "reasoning"
 */
function getRecommendedContext(modelName, taskType) {
  const model = specs.models[modelName];
  if (!model) return null;
  
  const recommendations = {
    "monitoring": Math.min(4096, model.safe_context),    // Simple checks
    "extraction": model.safe_context,                     // Structured data
    "reasoning": model.max_context                        // Deep thinking
  };
  
  return recommendations[taskType] || model.safe_context;
}

/**
 * Validate Ollama request payload before sending
 */
function validateOllamaRequest(payload) {
  const modelName = payload.model;
  const requestedContext = payload.options?.num_ctx || 2048; // Ollama default
  
  const validation = validateContext(modelName, requestedContext);
  
  if (validation.error) {
    console.error(`[CONTEXT ERROR] ${validation.error}`);
    // Auto-fix the payload
    payload.options = payload.options || {};
    payload.options.num_ctx = validation.contextSize;
    console.log(`[AUTO-FIX] Adjusted to ${validation.contextSize}`);
  }
  
  if (validation.warning) {
    console.warn(`[CONTEXT WARNING] ${validation.warning}`);
  }
  
  return {
    valid: !validation.error || validation.autoReduced,
    payload: payload,
    validation: validation
  };
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'check') {
    const model = args[1];
    const context = parseInt(args[2]);
    const result = validateContext(model, context);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.error ? 1 : 0);
  }
  
  if (args[0] === 'recommend') {
    const model = args[1];
    const taskType = args[2] || 'extraction';
    const context = getRecommendedContext(model, taskType);
    console.log(context);
    process.exit(0);
  }
  
  console.log(`Usage:
  node context-validator.js check <model> <context>
  node context-validator.js recommend <model> <taskType>

Examples:
  node context-validator.js check qwen3:8b 131072
  node context-validator.js recommend qwen3:32b extraction
`);
}

module.exports = {
  validateContext,
  getRecommendedContext,
  validateOllamaRequest
};
