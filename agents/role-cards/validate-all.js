#!/usr/bin/env node

/**
 * Role Card Validation Script
 * Validates all 8 role cards against schema.json
 * 
 * Usage:
 *   node validate-all.js
 *   
 * Requirements:
 *   npm install ajv ajv-formats
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Initialize validator
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Load schema
const schemaPath = path.join(__dirname, 'schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const validate = ajv.compile(schema);

// Agent IDs to validate
const agents = ['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo', 'nexus'];

// Validation results
const results = {
  passed: [],
  failed: [],
};

// Validate each role card
console.log('🔍 Validating Role Cards...\n');

for (const agentId of agents) {
  const cardPath = path.join(__dirname, `${agentId}.json`);
  
  try {
    const roleCard = JSON.parse(fs.readFileSync(cardPath, 'utf-8'));
    const valid = validate(roleCard);
    
    if (valid) {
      results.passed.push(agentId);
      console.log(`✅ ${agentId.padEnd(12)} VALID`);
    } else {
      results.failed.push({ agentId, errors: validate.errors });
      console.log(`❌ ${agentId.padEnd(12)} INVALID`);
      console.error(`   Errors:`, JSON.stringify(validate.errors, null, 2));
    }
  } catch (error) {
    results.failed.push({ agentId, errors: [{ message: error.message }] });
    console.log(`❌ ${agentId.padEnd(12)} ERROR`);
    console.error(`   ${error.message}`);
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Validation Summary');
console.log('='.repeat(50));
console.log(`✅ Passed: ${results.passed.length}/${agents.length}`);
console.log(`❌ Failed: ${results.failed.length}/${agents.length}`);

if (results.failed.length > 0) {
  console.log('\n❌ Failed Role Cards:');
  results.failed.forEach(({ agentId, errors }) => {
    console.log(`  - ${agentId}`);
    errors.forEach((error, idx) => {
      console.log(`    ${idx + 1}. ${error.instancePath || 'root'}: ${error.message}`);
    });
  });
}

// Contract compatibility check
console.log('\n' + '='.repeat(50));
console.log('🔗 Contract Compatibility Check');
console.log('='.repeat(50));

const roleCards = new Map();
for (const agentId of agents) {
  const cardPath = path.join(__dirname, `${agentId}.json`);
  const roleCard = JSON.parse(fs.readFileSync(cardPath, 'utf-8'));
  roleCards.set(agentId, roleCard);
}

let compatiblePairs = 0;
let incompatiblePairs = 0;

for (const fromAgent of agents) {
  const fromCard = roleCards.get(fromAgent);
  
  for (const output of fromCard.outputs) {
    const toAgent = output.target;
    
    // Skip non-agent targets
    if (!agents.includes(toAgent)) continue;
    
    const toCard = roleCards.get(toAgent);
    const inputContract = toCard.inputs.find(i => i.source === fromAgent);
    
    if (!inputContract) {
      console.log(`⚠️  ${fromAgent} → ${toAgent}: No input contract (output type: ${output.type})`);
      incompatiblePairs++;
      continue;
    }
    
    // Check format compatibility
    if (output.format !== inputContract.format) {
      console.log(`❌ ${fromAgent} → ${toAgent}: Format mismatch (${output.format} vs ${inputContract.format})`);
      incompatiblePairs++;
      continue;
    }
    
    // Check type compatibility
    if (output.type !== inputContract.type) {
      console.log(`❌ ${fromAgent} → ${toAgent}: Type mismatch (${output.type} vs ${inputContract.type})`);
      incompatiblePairs++;
      continue;
    }
    
    console.log(`✅ ${fromAgent} → ${toAgent}: ${output.type} (${output.format})`);
    compatiblePairs++;
  }
}

console.log('\n' + '='.repeat(50));
console.log(`✅ Compatible pairs: ${compatiblePairs}`);
console.log(`❌ Incompatible pairs: ${incompatiblePairs}`);

// Exit code
if (results.failed.length > 0 || incompatiblePairs > 0) {
  console.log('\n❌ Validation failed!');
  process.exit(1);
} else {
  console.log('\n✅ All validations passed!');
  process.exit(0);
}
