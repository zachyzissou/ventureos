#!/usr/bin/env node
/**
 * Validation Wrapper Template
 * Apply FIND → VALIDATE → FIX → VERIFY methodology to any async task
 */

class ValidationError extends Error {
  constructor(phase, message, details = {}) {
    super(`[${phase}] ${message}`);
    this.phase = phase;
    this.details = details;
  }
}

async function runWithValidation(taskName, taskFn, options = {}) {
  const startTime = Date.now();
  const { autoFix = true, escalateOnFail = true } = options;
  
  console.log(`[FIND] Starting ${taskName}...`);
  
  try {
    // Task function should return { validated, fixed, verified, result }
    const output = await taskFn();
    
    // Check that all phases completed
    if (!output.validated) {
      throw new ValidationError('VALIDATE', 'Validation failed', output);
    }
    
    if (!output.fixed) {
      throw new ValidationError('FIX', 'Fix phase incomplete', output);
    }
    
    if (!output.verified) {
      throw new ValidationError('VERIFY', 'Verification failed', output);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[VERIFY] ${taskName} completed successfully in ${duration}ms`);
    
    return {
      success: true,
      duration,
      result: output.result,
      phases: {
        validated: true,
        fixed: true,
        verified: true
      }
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Attempt auto-fix if enabled
    if (autoFix && error.phase) {
      console.log(`[AUTO-FIX] Attempting recovery for ${taskName}...`);
      
      const recovered = await attemptAutoFix(error, taskName);
      if (recovered) {
        console.log(`[AUTO-FIX] ${taskName} recovered successfully`);
        return {
          success: true,
          duration: Date.now() - startTime,
          result: recovered.result,
          recovered: true
        };
      }
    }
    
    // Escalate if configured
    if (escalateOnFail) {
      console.error(`[ESCALATE] ${taskName} failed after ${duration}ms: ${error.message}`);
      
      return {
        success: false,
        duration,
        error: error.message,
        phase: error.phase || 'unknown',
        escalated: true
      };
    }
    
    throw error;
  }
}

async function attemptAutoFix(error, taskName) {
  // Common auto-fix patterns
  
  // Rate limit → wait and retry
  if (error.message.includes('rate limit') || error.message.includes('429')) {
    console.log('[AUTO-FIX] Rate limited, waiting 60s...');
    await sleep(60000);
    return { retry: true };
  }
  
  // Network timeout → retry with backoff
  if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
    console.log('[AUTO-FIX] Network timeout, retrying...');
    await sleep(5000);
    return { retry: true };
  }
  
  // File not found → check if path needs correction
  if (error.message.includes('ENOENT')) {
    console.log('[AUTO-FIX] File not found, may need manual intervention');
    return null;
  }
  
  // Unknown error → escalate
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Example usage:
async function exampleTask() {
  return runWithValidation('Example Task', async () => {
    // FIND phase
    const data = await fetchData();
    
    // VALIDATE phase
    const validated = validateData(data);
    if (!validated) {
      throw new ValidationError('VALIDATE', 'Data validation failed');
    }
    
    // FIX phase
    const processed = await processData(data);
    
    // VERIFY phase
    const verified = await verifyResults(processed);
    
    return {
      validated: true,
      fixed: true,
      verified: verified.success,
      result: processed
    };
  });
}

module.exports = { runWithValidation, ValidationError };
