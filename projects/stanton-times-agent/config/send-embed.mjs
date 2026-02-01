#!/usr/bin/env node
/**
 * Stanton Times Embed Sender
 * Sends all messages as beautifully formatted Discord webhook embeds
 * 
 * Usage: 
 *   node send-embed.mjs --title "Title" --description "Body text" [options]
 *   node send-embed.mjs --json '{"title":"...", "description":"...", ...}'
 * 
 * Options:
 *   --title        Embed title
 *   --description  Main body text  
 *   --color        Hex color (default: 0x1DA1F2 - Twitter blue)
 *   --footer       Footer text
 *   --thumbnail    Thumbnail URL
 *   --image        Large image URL
 *   --url          Title link URL
 *   --fields       JSON array of {name, value, inline} objects
 *   --thread       JSON array of tweet strings for thread display
 *   --json         Full embed JSON object
 *   --ping         User ID to ping (optional)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const WEBHOOK_URL = env.STANTON_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('Error: STANTON_WEBHOOK_URL not set');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

let embed;
let jsonArg = getArg('json');

// Support --file to read JSON from a file
const fileArg = getArg('file');
if (fileArg) {
  jsonArg = readFileSync(join(__dirname, fileArg), 'utf-8');
}

// Helper to unescape literal \n and \' from shell escaping
const unescape = (str) => str ? str.replace(/\\n/g, '\n').replace(/\\'/g, "'") : str;

if (jsonArg) {
  embed = JSON.parse(jsonArg);
  // Unescape any double-escaped content in JSON mode too
  if (embed.description) embed.description = unescape(embed.description);
  if (embed.fields) {
    embed.fields = embed.fields.map(f => ({
      ...f,
      value: unescape(f.value),
      name: unescape(f.name)
    }));
  }
} else {
  embed = {
    title: unescape(getArg('title')),
    description: unescape(getArg('description')),
    color: parseInt(getArg('color') || '0x1DA1F2', 16),
    timestamp: new Date().toISOString()
  };
  
  if (getArg('footer')) embed.footer = { text: unescape(getArg('footer')) };
  if (getArg('thumbnail')) embed.thumbnail = { url: getArg('thumbnail') };
  if (getArg('image')) embed.image = { url: getArg('image') };
  if (getArg('url')) embed.url = getArg('url');
  
  // Thread support - format as description with tweet numbering
  const threadArg = getArg('thread');
  if (threadArg) {
    const threadTweets = JSON.parse(threadArg);
    if (Array.isArray(threadTweets) && threadTweets.length > 1) {
      const threadIcon = threadTweets.length > 5 ? '🧵⚠️' : '🧵';
      embed.description = `${threadIcon} **Thread (${threadTweets.length} tweets)**\n\n`;
      threadTweets.forEach((tweet, i) => {
        embed.description += `**[${i + 1}/${threadTweets.length}]** ${unescape(tweet)}\n\n`;
      });
      embed.description = embed.description.trim();
    } else if (Array.isArray(threadTweets) && threadTweets.length === 1) {
      // Single tweet thread - just use as description
      embed.description = unescape(threadTweets[0]);
    }
  }
  
  if (getArg('fields')) {
    embed.fields = JSON.parse(getArg('fields')).map(f => ({
      ...f,
      value: unescape(f.value),
      name: unescape(f.name)
    }));
  }
}

if (!embed.title && !embed.description) {
  console.error('Error: Need at least --title or --description');
  console.error('Usage: node send-embed.mjs --title "Title" --description "Body"');
  process.exit(1);
}

const payload = {
  username: 'The Stanton Times',
  avatar_url: 'https://pbs.twimg.com/profile_images/1927617270894493696/tKqgVvOp_400x400.jpg',
  embeds: [embed]
};

// Add ping if requested
const ping = getArg('ping');
if (ping) {
  payload.content = `<@${ping}>`;
}

try {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const text = await res.text();
    console.error(`Webhook failed: ${res.status} ${text}`);
    process.exit(1);
  }
  
  console.log('✓ Embed sent successfully');
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
