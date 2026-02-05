#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Capture command line arguments
const [emoji, username, msgId, context] = process.argv.slice(2);

// Logging function
function log(message) {
    const logPath = path.join(__dirname, 'reaction_log.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `${timestamp} - ${message}\n`);
}

// State management function
function updateState(status) {
    const statePath = path.join(__dirname, 'state.json');
    let state = {};
    
    try {
        state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (error) {
        // Initialize if file doesn't exist
    }

    // Update state based on reaction
    state.last_reaction = {
        emoji,
        username,
        messageId: msgId,
        context,
        timestamp: new Date().toISOString(),
        status
    };

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// Main reaction processing
function processReaction() {
    switch (emoji) {
        case '✅':
            log(`APPROVED by ${username}: ${context}`);
            updateState('approved');
            break;
        case '❌':
            log(`REJECTED by ${username}: ${context}`);
            updateState('rejected');
            break;
        case '🤔':
            log(`NEEDS REVIEW by ${username}: ${context}`);
            updateState('pending');
            break;
        default:
            log(`UNKNOWN REACTION ${emoji} by ${username}: ${context}`);
            updateState('unknown');
    }
}

// Execute
processReaction();