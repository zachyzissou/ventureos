#!/usr/bin/env node
// whoop-morning.mjs — Fetch WHOOP recovery, sleep, strain data and format a morning check-in
// Usage: node whoop-morning.mjs
// Reads tokens from ~/.cache/whoop-morning/tokens.json

import fs from 'fs';
import path from 'path';

const CREDS_PATH = path.join(process.env.HOME, '.openclaw', 'credentials', 'whoop.json');
const TOKENS_PATH = path.join(process.env.HOME, '.cache', 'whoop-morning', 'tokens.json');
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE = 'https://api.prod.whoop.com/developer';

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

// Load tokens
function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  } catch {
    console.error('ERROR: No tokens found. Run whoop-auth.mjs first.');
    process.exit(1);
  }
}

function saveTokens(tokens) {
  fs.mkdirSync(path.dirname(TOKENS_PATH), { recursive: true });
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2) + '\n');
  fs.chmodSync(TOKENS_PATH, 0o600);
}

async function refreshAccessToken(tokens) {
  if (!tokens.refresh_token) {
    console.error('ERROR: No refresh token. Re-run whoop-auth.mjs');
    process.exit(1);
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`ERROR: Token refresh failed (${res.status}): ${err}`);
    process.exit(1);
  }

  const newTokens = await res.json();
  newTokens.expires_at_ms = Date.now() + (newTokens.expires_in * 1000);
  newTokens.refreshed_at = new Date().toISOString();
  saveTokens(newTokens);
  return newTokens;
}

async function getAccessToken() {
  let tokens = loadTokens();
  
  // Check if access token is still valid (with 2 min buffer)
  const isValid = tokens.expires_at_ms && (Date.now() + 120000 < tokens.expires_at_ms);
  if (!isValid) {
    tokens = await refreshAccessToken(tokens);
  }
  return tokens.access_token;
}

async function apiGet(endpoint, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`API ${endpoint} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

function formatDuration(ms) {
  if (!ms) return 'N/A';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function recoveryEmoji(score) {
  if (score >= 67) return '🟢';
  if (score >= 34) return '🟡';
  return '🔴';
}

async function main() {
  const token = await getAccessToken();

  // Fetch data in parallel
  const [recovery, sleep, cycle, profile] = await Promise.all([
    apiGet('/v1/recovery?limit=1', token),
    apiGet('/v1/activity/sleep?limit=1', token),
    apiGet('/v1/cycle?limit=1', token),
    apiGet('/v1/user/profile/basic', token),
  ]);

  const firstName = profile?.first_name || 'there';
  
  // Parse recovery
  const rec = recovery?.records?.[0]?.score;
  const recoveryScore = rec?.recovery_score;
  const hrv = rec?.hrv_rmssd_milli;
  const rhr = rec?.resting_heart_rate;

  // Parse sleep
  const slp = sleep?.records?.[0]?.score;
  const sleepPerf = slp?.sleep_performance_percentage;
  const sleepDuration = slp?.stage_summary?.total_in_bed_time_milli;
  const remDuration = slp?.stage_summary?.total_rem_sleep_time_milli;
  const deepDuration = slp?.stage_summary?.total_slow_wave_sleep_time_milli;
  const sleepEfficiency = slp?.sleep_efficiency_percentage;
  const respiratoryRate = slp?.respiratory_rate;

  // Parse cycle/strain
  const cyc = cycle?.records?.[0]?.score;
  const strain = cyc?.strain;
  const calories = cyc?.kilojoule ? Math.round(cyc.kilojoule * 0.239006) : null;
  const avgHr = cyc?.average_heart_rate;
  const maxHr = cyc?.max_heart_rate;

  // Build output
  const lines = [];
  lines.push(`🏋️ **WHOOP Morning Check-in** — Hey ${firstName}!\n`);

  if (recoveryScore != null) {
    lines.push(`**Recovery:** ${recoveryEmoji(recoveryScore)} ${recoveryScore}%`);
    if (hrv != null) lines.push(`  HRV: ${(hrv).toFixed(0)} ms`);
    if (rhr != null) lines.push(`  RHR: ${rhr} bpm`);
  } else {
    lines.push('**Recovery:** No data yet today');
  }

  lines.push('');

  if (sleepPerf != null) {
    lines.push(`**Sleep:** ${sleepPerf}% performance`);
    if (sleepDuration) lines.push(`  Total: ${formatDuration(sleepDuration)}`);
    if (remDuration) lines.push(`  REM: ${formatDuration(remDuration)}`);
    if (deepDuration) lines.push(`  Deep: ${formatDuration(deepDuration)}`);
    if (sleepEfficiency != null) lines.push(`  Efficiency: ${sleepEfficiency}%`);
    if (respiratoryRate != null) lines.push(`  Respiratory rate: ${respiratoryRate.toFixed(1)} rpm`);
  } else {
    lines.push('**Sleep:** No data yet today');
  }

  lines.push('');

  if (strain != null) {
    lines.push(`**Yesterday's Strain:** ${strain.toFixed(1)} / 21.0`);
    if (calories) lines.push(`  Calories: ${calories} kcal`);
    if (avgHr) lines.push(`  Avg HR: ${avgHr} bpm | Max: ${maxHr || '?'} bpm`);
  } else {
    lines.push('**Strain:** No data yet');
  }

  lines.push('');

  // Suggestions based on recovery + sleep
  const suggestions = [];
  if (recoveryScore != null) {
    if (recoveryScore >= 67) {
      suggestions.push('- 🟢 High recovery — good day for intensity. Push it if you want.');
      suggestions.push('- Consider a challenging workout or tackling demanding tasks.');
    } else if (recoveryScore >= 34) {
      suggestions.push('- 🟡 Moderate recovery — listen to your body.');
      suggestions.push('- Moderate activity is fine, avoid max effort.');
    } else {
      suggestions.push('- 🔴 Low recovery — prioritize rest today.');
      suggestions.push('- Light movement only. Focus on hydration and sleep tonight.');
    }
  }
  
  if (sleepPerf != null && sleepPerf < 70) {
    suggestions.push('- 😴 Sleep was below target — aim for an earlier bedtime tonight.');
  }

  if (suggestions.length > 0) {
    lines.push('**Suggestions:**');
    lines.push(...suggestions);
  }

  console.log(lines.join('\n'));
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
