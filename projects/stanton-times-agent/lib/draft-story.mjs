#!/usr/bin/env node
/**
 * Intelligent Story Drafter for StantonTimes
 * 
 * Decides whether content should be:
 * - Single tweet (condensed)
 * - Thread (multi-part)
 * 
 * Based on THREAD-STRATEGY.md guidelines
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Analyze content and decide: single tweet or thread?
 */
function shouldUseThread(content, metadata = {}) {
  const { type, isAnalysis, hasMultipleParts, isBreaking } = metadata;
  
  // Rule 1: If it fits in 280 chars, always single tweet
  if (content.length <= 280) return false;
  
  // Rule 2: Simple announcements = single tweet (even if long)
  const simpleTypes = ['announcement', 'quick_update', 'simple_news'];
  if (simpleTypes.includes(type)) return false;
  
  // Rule 3: Breaking news = single tweet (condensed for speed)
  if (isBreaking) return false;
  
  // Rule 4: Multi-part content structure detected
  if (hasMultipleParts) return true;
  
  // Rule 5: Complex analysis with length
  if (isAnalysis && content.length > 600) return true;
  
  // Rule 6: Event coverage with multiple points
  const hasEventMarkers = /\n-|• |1\.|2\.|3\./.test(content);
  if (hasEventMarkers && content.length > 500) return true;
  
  // Default: Try to condense to single tweet
  return false;
}

/**
 * Condense content to fit in a single tweet
 */
function condenseForSingleTweet(content) {
  // Remove extra whitespace
  let condensed = content.replace(/\n\n+/g, '\n').trim();
  
  // If still too long, use summarization hints
  if (condensed.length > 280) {
    // Try to extract key points (emoji + main message)
    const lines = condensed.split('\n').filter(l => l.trim());
    const keyLines = lines.filter(l => 
      l.startsWith('📰') || 
      l.startsWith('✨') || 
      l.includes('**') ||
      l.length < 100
    );
    
    if (keyLines.join('\n').length <= 280) {
      condensed = keyLines.join('\n');
    } else {
      // Last resort: truncate and add "..." with link hint
      condensed = condensed.substring(0, 260) + '...\n\nFull story: [link]';
    }
  }
  
  return condensed;
}

/**
 * Draft a story intelligently
 */
export function draftStory(content, metadata = {}) {
  const useThread = shouldUseThread(content, metadata);
  
  if (useThread) {
    // Compose thread
    const composeScript = join(__dirname, '../config/compose-thread.mjs');
    try {
      const result = execSync(
        `node "${composeScript}" "${content.replace(/"/g, '\\"')}"`,
        { encoding: 'utf8' }
      );
      const thread = JSON.parse(result);
      
      return {
        type: 'thread',
        thread: thread,
        tweetCount: thread.length
      };
    } catch (err) {
      console.error('⚠️  Thread composition failed, falling back to single tweet');
      console.error(err.message);
      // Fallback to condensed single tweet
      return {
        type: 'single',
        tweet: condenseForSingleTweet(content)
      };
    }
  } else {
    // Single tweet (condense if needed)
    return {
      type: 'single',
      tweet: condenseForSingleTweet(content)
    };
  }
}

// CLI usage for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const content = process.argv[2];
  const metadataArg = process.argv[3];
  
  if (!content) {
    console.error('Usage: node draft-story.mjs "content" \'{"type":"analysis","isAnalysis":true}\'');
    process.exit(1);
  }
  
  const metadata = metadataArg ? JSON.parse(metadataArg) : {};
  const draft = draftStory(content, metadata);
  
  console.log(JSON.stringify(draft, null, 2));
}
