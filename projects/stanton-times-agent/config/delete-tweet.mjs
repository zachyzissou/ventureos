#!/usr/bin/env node
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = resolve(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) env[key.trim()] = vals.join('=').trim();
});

const client = new TwitterApi({
  appKey: env.TWITTER_API_KEY,
  appSecret: env.TWITTER_API_SECRET,
  accessToken: env.TWITTER_ACCESS_TOKEN,
  accessSecret: env.TWITTER_ACCESS_SECRET,
});

const tweetId = process.argv[2];

if (!tweetId) {
  console.log('Usage: node delete-tweet.mjs <tweet-id>');
  process.exit(1);
}

try {
  console.log('🗑️ Deleting tweet', tweetId);
  await client.v2.deleteTweet(tweetId);
  console.log('✅ Tweet deleted');
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.data) console.error('Details:', JSON.stringify(error.data, null, 2));
  process.exit(1);
}
