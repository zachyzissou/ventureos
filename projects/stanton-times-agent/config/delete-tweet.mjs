#!/usr/bin/env node
/**
 * delete-tweet.mjs
 * Delete a tweet using Twitter API v1.1
 * 
 * Usage:
 *   node delete-tweet.mjs <tweet-id>
 *   node delete-tweet.mjs 2016969723905290272
 */

import https from 'https';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load credentials from .env file
function loadEnv() {
  const envPath = join(__dirname, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const [key, ...valueParts] = line.split('=');
    env[key.trim()] = valueParts.join('=').trim();
  });
  
  return env;
}

const env = loadEnv();

const oauth = {
  consumer_key: env.TWITTER_API_KEY,
  consumer_secret: env.TWITTER_API_SECRET,
  token: env.TWITTER_ACCESS_TOKEN,
  token_secret: env.TWITTER_ACCESS_SECRET
};

// OAuth helper functions
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function generateSignature(method, url, params, consumer_secret, token_secret) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
  
  const signatureBase = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumer_secret)}&${percentEncode(token_secret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');
  
  return signature;
}

function deleteTweet(tweetId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.twitter.com/1.1/statuses/destroy/${tweetId}.json`;
    const method = 'POST';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('base64').replace(/\W/g, '');

    const oauthParams = {
      oauth_consumer_key: oauth.consumer_key,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: oauth.token,
      oauth_version: '1.0'
    };

    const signature = generateSignature(method, url, oauthParams, oauth.consumer_secret, oauth.token_secret);
    oauthParams.oauth_signature = signature;

    const authHeader = 'OAuth ' + Object.keys(oauthParams)
      .sort()
      .map(key => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
      .join(', ');

    const options = {
      method: method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const parsed = JSON.parse(data);
          resolve({
            success: true,
            tweetId: parsed.id_str,
            text: parsed.text
          });
        } else {
          reject({
            success: false,
            statusCode: res.statusCode,
            error: data
          });
        }
      });
    });

    req.on('error', (e) => {
      reject({
        success: false,
        error: e.message
      });
    });

    req.end();
  });
}

// Main execution
async function main() {
  const tweetId = process.argv[2];
  
  if (!tweetId) {
    console.error('❌ Usage: node delete-tweet.mjs <tweet-id>');
    console.error('   Example: node delete-tweet.mjs 2016969723905290272');
    process.exit(1);
  }
  
  console.log(`🗑️  Deleting tweet ${tweetId}...`);
  
  try {
    const result = await deleteTweet(tweetId);
    console.log('✅ Tweet deleted successfully');
    console.log(`   ID: ${result.tweetId}`);
    console.log(`   Text: ${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to delete tweet');
    console.error(`   Status: ${error.statusCode || 'N/A'}`);
    console.error(`   Error: ${error.error || error.message}`);
    process.exit(1);
  }
}

main();
