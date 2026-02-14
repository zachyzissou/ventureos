#!/usr/bin/env node
// whoop-auth.mjs — OAuth2 authorization code flow for WHOOP API
// Usage: node whoop-auth.mjs
// Requires: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET in env or .credentials/whoop.json

import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

const CREDS_PATH = path.join(process.env.HOME, '.openclaw', 'credentials', 'whoop.json');
const TOKENS_PATH = path.join(process.env.HOME, '.cache', 'whoop-morning', 'tokens.json');
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const REDIRECT_URI = 'http://localhost:3000/callback';
const PORT = 3000;

const SCOPES = [
  'offline',
  'read:profile',
  'read:recovery',
  'read:sleep',
  'read:workout',
  'read:cycles',
  'read:body_measurement',
];

// Load credentials
let clientId, clientSecret;
try {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  clientId = creds.client_id;
  clientSecret = creds.client_secret;
} catch {
  clientId = process.env.WHOOP_CLIENT_ID;
  clientSecret = process.env.WHOOP_CLIENT_SECRET;
}

if (!clientId || !clientSecret) {
  console.error('ERROR: Set WHOOP_CLIENT_ID + WHOOP_CLIENT_SECRET or create', CREDS_PATH);
  process.exit(1);
}

// Generate state
const state = Math.random().toString(36).slice(2, 10);

// Build auth URL
const authParams = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPES.join(' '),
  state: state,
});

const fullAuthUrl = `${AUTH_URL}?${authParams}`;

console.log('\n🏋️ WHOOP OAuth Authorization\n');
console.log('Open this URL in your browser:\n');
console.log(fullAuthUrl);
console.log('\nWaiting for callback on http://localhost:3000/callback ...\n');

// Start local server to capture callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (returnedState !== state) {
    res.writeHead(400);
    res.end('State mismatch — possible CSRF attack');
    console.error('ERROR: State mismatch');
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received');
    console.error('ERROR: No code in callback');
    server.close();
    process.exit(1);
  }

  console.log('✅ Received authorization code. Exchanging for tokens...');

  // Exchange code for tokens
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData = await tokenRes.json();
    
    // Add expiry timestamp
    tokenData.expires_at_ms = Date.now() + (tokenData.expires_in * 1000);
    tokenData.obtained_at = new Date().toISOString();

    // Save tokens
    const tokensDir = path.dirname(TOKENS_PATH);
    fs.mkdirSync(tokensDir, { recursive: true });
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokenData, null, 2) + '\n');
    fs.chmodSync(TOKENS_PATH, 0o600);

    console.log('\n🎉 Success! Tokens saved to:', TOKENS_PATH);
    console.log('   Access token expires in:', tokenData.expires_in, 'seconds');
    console.log('   Refresh token:', tokenData.refresh_token ? '✅ received' : '❌ missing (did you request offline scope?)');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>✅ WHOOP Authorization Complete</h1><p>You can close this tab.</p>');
  } catch (err) {
    console.error('ERROR:', err.message);
    res.writeHead(500);
    res.end('Token exchange failed: ' + err.message);
  }

  server.close();
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}...`);
});

// Timeout after 5 minutes
setTimeout(() => {
  console.error('\nTimeout — no callback received in 5 minutes');
  server.close();
  process.exit(1);
}, 300000);
