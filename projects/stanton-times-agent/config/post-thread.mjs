#!/usr/bin/env node
/**
 * Post a Twitter/X thread using bird CLI
 * Usage: node post-thread.mjs '["tweet 1", "tweet 2", "tweet 3"]'
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get thread from command line (JSON array of strings)
const threadJSON = process.argv[2];
if (!threadJSON) {
  console.error('Usage: node post-thread.mjs \'["tweet 1", "tweet 2", "tweet 3"]\'');
  process.exit(1);
}

let threadTweets;
try {
  threadTweets = JSON.parse(threadJSON);
} catch (err) {
  console.error('Error: Thread must be a valid JSON array of strings');
  console.error('Example: \'["First tweet", "Second tweet", "Third tweet"]\'');
  process.exit(1);
}

if (!Array.isArray(threadTweets) || threadTweets.length === 0) {
  console.error('Error: Thread must be a non-empty array');
  process.exit(1);
}

const BIRD_AUTH_SCRIPT = resolve(__dirname, '../../../scripts/bird-auth.sh');

async function postThread(tweets) {
  const results = [];
  let previousTweetId = null;

  for (let i = 0; i < tweets.length; i++) {
    const tweetText = tweets[i];
    const tweetNumber = i + 1;
    const totalTweets = tweets.length;

    console.log(`\n[${tweetNumber}/${totalTweets}] Posting tweet...`);
    
    try {
      let tweetId;
      
      if (i === 0) {
        // First tweet - post as new tweet
        const result = execSync(
          `${BIRD_AUTH_SCRIPT} tweet "${tweetText.replace(/"/g, '\\"')}" --json`,
          { encoding: 'utf8' }
        );
        const data = JSON.parse(result);
        tweetId = data.id;
        console.log(`✅ Tweet 1 posted: https://x.com/TheStantonTimes/status/${tweetId}`);
      } else {
        // Subsequent tweets - reply to previous
        const result = execSync(
          `${BIRD_AUTH_SCRIPT} reply ${previousTweetId} "${tweetText.replace(/"/g, '\\"')}" --json`,
          { encoding: 'utf8' }
        );
        const data = JSON.parse(result);
        tweetId = data.id;
        console.log(`✅ Tweet ${tweetNumber} posted (reply): https://x.com/TheStantonTimes/status/${tweetId}`);
      }

      results.push({
        index: i,
        id: tweetId,
        url: `https://x.com/TheStantonTimes/status/${tweetId}`,
        text: tweetText
      });

      previousTweetId = tweetId;

      // Rate limit protection: wait 1 second between tweets
      if (i < tweets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (err) {
      console.error(`\n❌ Error posting tweet ${tweetNumber}:`, err.message);
      console.error('Thread posting aborted.');
      
      // Return partial results if some tweets succeeded
      if (results.length > 0) {
        console.log('\n⚠️  Partial thread posted:');
        results.forEach(r => {
          console.log(`  [${r.index + 1}] ${r.url}`);
        });
      }
      
      process.exit(1);
    }
  }

  // Success - print full thread
  console.log(`\n🎉 Thread posted successfully! (${results.length} tweets)`);
  console.log('\nThread URLs:');
  results.forEach(r => {
    console.log(`  [${r.index + 1}/${results.length}] ${r.url}`);
  });
  
  // Print thread URL (first tweet)
  console.log(`\n🔗 Thread link: ${results[0].url}`);
  
  return results;
}

postThread(threadTweets);
