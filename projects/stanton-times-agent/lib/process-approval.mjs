#!/usr/bin/env node
/**
 * Process approved stories - handles both single tweets and threads
 * 
 * Usage:
 *   node process-approval.mjs <approval-id> <action>
 * 
 * Actions: approve, reject, hold
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '../config/state.json');

function loadState() {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function processApproval(approvalId, action) {
  const state = loadState();
  const approvalIndex = state.pendingApprovals.findIndex(a => a.id === approvalId);
  
  if (approvalIndex === -1) {
    console.error(`❌ Approval not found: ${approvalId}`);
    process.exit(1);
  }
  
  const approval = state.pendingApprovals[approvalIndex];
  
  if (action === 'approve') {
    console.log(`\n✅ Processing approval: ${approval.topic}`);
    
    // Check if it's a thread or single tweet
    if (approval.thread && Array.isArray(approval.thread)) {
      // Post thread
      console.log(`📝 Posting thread (${approval.thread.length} tweets)...`);
      
      const postThreadScript = join(__dirname, '../config/post-thread.mjs');
      const threadJSON = JSON.stringify(approval.thread);
      
      try {
        const result = execSync(
          `node "${postThreadScript}" '${threadJSON.replace(/'/g, "\\'")}'`,
          { encoding: 'utf8' }
        );
        console.log(result);
        
        // Add to posted stories
        state.posted_stories.push({
          topic: approval.topic,
          source: approval.source,
          posted_at: new Date().toISOString(),
          type: 'thread',
          tweet_count: approval.thread.length
        });
        
      } catch (err) {
        console.error(`❌ Failed to post thread: ${err.message}`);
        process.exit(1);
      }
      
    } else if (approval.tweet) {
      // Post single tweet
      console.log(`📝 Posting single tweet...`);
      
      const postTweetScript = join(__dirname, '../config/post-tweet.mjs');
      
      try {
        const result = execSync(
          `node "${postTweetScript}" "${approval.tweet.replace(/"/g, '\\"')}"`,
          { encoding: 'utf8' }
        );
        console.log(result);
        
        // Add to posted stories
        state.posted_stories.push({
          topic: approval.topic,
          source: approval.source,
          posted_at: new Date().toISOString(),
          type: 'single'
        });
        
      } catch (err) {
        console.error(`❌ Failed to post tweet: ${err.message}`);
        process.exit(1);
      }
      
    } else {
      console.error(`❌ Approval has neither 'thread' nor 'tweet' field`);
      process.exit(1);
    }
    
    // Remove from pending approvals
    state.pendingApprovals.splice(approvalIndex, 1);
    saveState(state);
    
    console.log(`\n✅ Story posted and removed from pending approvals`);
    
  } else if (action === 'reject') {
    console.log(`\n❌ Rejecting: ${approval.topic}`);
    
    // Remove from pending approvals
    state.pendingApprovals.splice(approvalIndex, 1);
    saveState(state);
    
    console.log(`✅ Story rejected and removed from pending approvals`);
    
  } else if (action === 'hold') {
    console.log(`\n🤔 Holding: ${approval.topic}`);
    console.log(`Story will remain in pending approvals for further review`);
    
  } else {
    console.error(`Unknown action: ${action}`);
    console.error(`Valid actions: approve, reject, hold`);
    process.exit(1);
  }
}

// CLI usage
const approvalId = process.argv[2];
const action = process.argv[3];

if (!approvalId || !action) {
  console.error('Usage: node process-approval.mjs <approval-id> <action>');
  console.error('Actions: approve, reject, hold');
  process.exit(1);
}

processApproval(approvalId, action);
