import { createHmac, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = resolve(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const CONSUMER_KEY = env.TWITTER_API_KEY;
const CONSUMER_SECRET = env.TWITTER_API_SECRET;
const ACCESS_TOKEN = env.TWITTER_ACCESS_TOKEN;
const ACCESS_SECRET = env.TWITTER_ACCESS_SECRET;

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateOAuthHeader(method, url, params = {}) {
  const oauthParams = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: '1.0'
  };

  const allParams = { ...oauthParams, ...params };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys.map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join('&');
  const signatureBase = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(CONSUMER_SECRET)}&${percentEncode(ACCESS_SECRET)}`;
  const signature = createHmac('sha1', signingKey).update(signatureBase).digest('base64');

  oauthParams.oauth_signature = signature;
  const headerParts = Object.keys(oauthParams).sort().map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`);
  return `OAuth ${headerParts.join(', ')}`;
}

async function postTweet(text) {
  const url = 'https://api.twitter.com/2/tweets';
  const body = JSON.stringify({ text });
  
  const oauthHeader = generateOAuthHeader('POST', url);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': oauthHeader,
      'Content-Type': 'application/json'
    },
    body
  });

  const result = await response.json();
  
  if (!response.ok) {
    console.error('Error posting tweet:', JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const tweetId = result.data?.id;
  const tweetUrl = `https://x.com/TheStantonTimes/status/${tweetId}`;
  console.log(`Tweet posted: ${tweetUrl}`);
  return { id: tweetId, url: tweetUrl };
}

// Get tweet text from command line
const tweetText = process.argv[2];
if (!tweetText) {
  console.error('Usage: node post-tweet.mjs "tweet text"');
  process.exit(1);
}

postTweet(tweetText);
