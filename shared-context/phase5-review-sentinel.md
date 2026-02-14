# Phase 5 Security Review — Sentinel (Photon Cannon)

**Reviewer:** Sentinel — Security & Data Protection  
**Spec:** Phase 5: StarCraft Tactical Command Center — Full Design Specification  
**Date:** 2026-02-14  
**Overall Feasibility:** 🟡 YELLOW — Solid design, but significant security gaps need addressing before implementation

> *"Your enemies shall fall — but only if you seal the gates first."*  
> — Sentinel, reviewing the tactical map perimeter

---

## Executive Summary

The spec is architecturally sound for a single-admin dashboard, but it **assumes a trusted environment throughout** and never addresses authentication, authorization, input sanitization, or transport security. For a system that exposes real-time agent sessions, message content, historical activity, and performance metrics, these are not optional concerns — they are prerequisites.

The most critical risks are: unauthenticated API endpoints exposing session data, WebSocket event streams with no access control, and potential XSS vectors in task/mission descriptions rendered in the UI. The good news: sound assets are bundled (no upload vector), the rendering engine choice (PixiJS) is solid, and most risks can be mitigated with a focused security hardening pass before Phase 5.1 ships.

---

## P0 — Critical (Must Fix Before Any Deployment)

### P0-1: No Authentication on Any API Endpoint

**Location:** §11 Technical Architecture — API Endpoints  
**Risk:** Every endpoint (`/api/agents/status`, `/api/sessions/active`, `/api/replay/:timestamp`, etc.) is defined with no authentication mechanism. Anyone who can reach the server can query full agent state, active sessions, historical replays, and bond data.

**What's exposed:**
- Active isolated sessions and their labels (`/api/sessions/active`)
- Full agent stats, recent missions, and session details (`/api/agents/:id/detail`)
- 30 days of historical state reconstruction (`/api/replay/:timestamp`)
- Real-time event stream including security events (`/api/events` WebSocket)

**Impact:** Complete data exposure. An attacker (or simply an unauthorized user on the same network) can observe everything every agent is doing, has done, and how they perform.

**Mitigation:**
1. **Session-based auth** — Require authenticated session token (cookie or Bearer token) on all API requests
2. **API key for server-to-server** — If the API server is separate from the frontend, use API key validation
3. **WebSocket auth** — Require auth token in the WebSocket handshake (connection upgrade) or first message
4. **Default deny** — No endpoint should respond without valid credentials

---

### P0-2: Isolated Session Exposure via Activity Mapping

**Location:** §5 Activity Mapping — Detection Source column; §12 Data Integration — `sessions_list(kinds=["isolated"])`  
**Risk:** The activity detection system calls `sessions_list(kinds=["isolated"])` to determine what agents are working on. Isolated sessions exist precisely because they are private, sandboxed contexts. Displaying their labels, durations, and progress on a shared tactical map **defeats the isolation guarantee**.

**What's exposed:**
- That an isolated session exists (reveals private work is happening)
- The session label (via activity-mapper.js regex matching — the label must be read to classify)
- Duration and progress (via the progress bar calculation: `elapsed = now - session_start_time`)
- Effectively: what each agent is privately working on, and for how long

**Impact:** Agent privacy violation. If agent sessions contain sensitive operations (security audits, incident response, HR-related tasks), the map broadcasts this to all viewers.

**Mitigation:**
1. **Filter by visibility** — Only display sessions explicitly marked as "public" or "visible." Add a `visibility` field to sessions/missions
2. **Aggregate, don't enumerate** — Show "Agent is ACTIVE (2 sessions)" without revealing session labels
3. **Redact isolated sessions** — Never surface `kind=isolated` session details on the map. Show building state (ACTIVE) but not *what* it's doing
4. **Per-agent opt-in** — Let each agent configure whether their activity details appear on the tactical map

---

### P0-3: XSS via Task/Mission Descriptions in UI

**Location:** §7 Progress & Status Indicators (Alert Feed, Mission Sidebar); §8 Interactive Features (Building Detail Panel); §12 Data Integration (`GROUP_CONCAT(description, ' | ')`)  
**Risk:** Multiple UI components render text sourced from database fields:
- Alert feed: `description` from `missions` and `issue_description` from `escalations`
- Mission sidebar: task names and descriptions
- Building detail panel: "current session, recent completions"
- Hover tooltips: task names (e.g., "Oracle — Researching: Phase 5 Spec (75% complete)")
- Bond detail modal: interaction reasons from `khala_drift_history.reason`

The spec's SQL in §12 uses `GROUP_CONCAT(description, ' | ')` directly. If any description contains `<script>` tags, HTML entities, or event handlers, and this is rendered without sanitization, it's a stored XSS vulnerability.

**Impact:** If an attacker can influence a mission description or session label (even via indirect injection through task creation), they can execute arbitrary JavaScript in any viewer's browser, potentially stealing session tokens, manipulating the UI, or exfiltrating data from localStorage.

**Mitigation:**
1. **Sanitize all database-sourced text** — Use a whitelist HTML sanitizer (DOMPurify) or escape all HTML entities before rendering
2. **PixiJS Text objects are safe** — PixiJS `PIXI.Text` renders to canvas, which is inherently XSS-safe. **Use PixiJS text rendering for all in-canvas labels** (this is already likely the plan)
3. **HTML panels need explicit sanitization** — The slide-in panels, modals, and HUD overlays (§8) appear to be DOM elements (CSS-styled). These MUST sanitize all dynamic text
4. **CSP header** — Add `Content-Security-Policy` to block inline scripts: `script-src 'self'`
5. **Never use `innerHTML`** — Use `textContent` or a templating library with auto-escaping

---

## P1 — High (Must Fix Before Production Use)

### P1-1: WebSocket Event Stream — No Auth, No Origin Validation, No Rate Limiting

**Location:** §11 Technical Architecture — `/api/events` WebSocket  
**Risk:** The WebSocket endpoint streams all real-time events (mission completions, security alerts, drift events, collaboration events) with no specified:
- Authentication handshake
- Origin header validation
- Connection rate limiting
- Message size limits
- Reconnection backoff

**Attack vectors:**
- **Eavesdropping:** Open a WebSocket connection from any origin, passively observe all agent activity
- **Connection flooding:** Open thousands of WebSocket connections to exhaust server resources (DoS)
- **Cross-site WebSocket hijacking (CSWSH):** If a user is authenticated via cookies and visits a malicious page, that page can open a WebSocket to the API server and the browser will send cookies automatically
- **Session hijacking:** If WebSocket connections carry session context, a stolen connection can impersonate a viewer

**Mitigation:**
1. **Auth on upgrade** — Validate auth token during the HTTP→WebSocket upgrade handshake. Reject unauthenticated upgrades with 401
2. **Origin whitelist** — Check the `Origin` header against allowed domains. Reject cross-origin WebSocket requests
3. **Connection limit** — Max 5 WebSocket connections per authenticated user
4. **Heartbeat/ping** — Implement WebSocket ping/pong to detect and drop stale connections (30s timeout)
5. **Message validation** — Validate all incoming messages (if client sends anything). Treat client messages as untrusted

---

### P1-2: Replay Mode — Unbounded Historical Data Access

**Location:** §10 Historical Replay Mode; §11 API Endpoints (`/api/replay/:timestamp`, `/api/replay/events?from=&to=`)  
**Risk:** The replay system allows reconstructing full system state at any arbitrary timestamp across a 30-day window. This includes:
- Which agents were active and what they were working on
- All bond affinities and drift events
- All mission start/completion times with descriptions
- All escalation events with `issue_description`
- All interaction logs

There are no access controls on the replay API, no audit logging of who accessed what historical data, and no data retention limits beyond the 30-day UI window.

**What could leak:**
- Historical security incidents (escalations with full descriptions)
- Agent performance patterns over time (who works when, how long tasks take)
- Deleted or resolved issues that should no longer be visible
- Collaboration patterns revealing internal team dynamics

**Mitigation:**
1. **Auth required** — Same as P0-1 (replay endpoints need authentication)
2. **Audit log** — Log all replay API access (who, when, what timestamp range)
3. **Data scoping** — Replay should only show data the authenticated user is authorized to see
4. **Retention policy** — Define how long replay data is retained. Consider 7-day default, 30-day for admin
5. **Redaction** — Apply the same session visibility filters (P0-2) to historical data. Don't show historical isolated sessions in replay

---

### P1-3: Message Content Exposure in Click Handlers

**Location:** §8 Interactive Features — Click Actions table  
**Risk:** The click action on an "Agent unit" shows: "Current session, **recent message**, top KPI"  
The building detail panel shows: "Full agent status, all active tasks, recent completions, KPI chart"

"Recent message" is vague but concerning. If this means the last message *content* from an agent's session, it could expose:
- Private conversations
- Sensitive data being processed
- Internal reasoning or deliberation
- User-provided information being handled by the agent

**Impact:** Even a single message preview could leak sensitive information. Consider: "Sentinel — Last message: 'Investigating potential data breach in user account #4521...'"

**Mitigation:**
1. **No message content on the map** — Show session labels and status only, never message text
2. **If message preview is needed** — Truncate to first 50 chars, strip any PII patterns (emails, IDs, etc.), and require click-through to full view with additional auth check
3. **Classify messages** — Allow agents to mark messages as `internal` (not shown) vs `status` (can be shown)
4. **Default to opaque** — "Oracle is active on 1 session" is sufficient. Don't show *what* they're saying

---

### P1-4: No CORS Policy Defined

**Location:** §11 Technical Architecture (absent)  
**Risk:** The spec defines an API server and WebSocket endpoint but never mentions CORS (Cross-Origin Resource Sharing). If the API runs on a different port or domain from the frontend, browsers will block requests by default — but if a developer adds `Access-Control-Allow-Origin: *` to "fix" it, all endpoints become accessible from any website.

**Mitigation:**
1. **Explicit CORS whitelist** — Only allow the tactical map's origin (e.g., `https://map.ventureos.local`)
2. **No wildcard** — Never use `Access-Control-Allow-Origin: *`
3. **Credentials mode** — If using cookies, set `Access-Control-Allow-Credentials: true` with specific origin (not `*`)
4. **Document in spec** — Add a CORS section to §11 Technical Architecture

---

### P1-5: No Content Security Policy (CSP)

**Location:** §11 Technical Architecture (absent)  
**Risk:** Without CSP headers, any XSS vulnerability (see P0-3) has full impact — injected scripts can load external resources, exfiltrate data, and modify the page. CSP is a critical defense-in-depth layer.

**Mitigation:**
Add CSP headers to the API server response:
```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  connect-src 'self' wss://;
  media-src 'self';
  font-src 'self';
  object-src 'none';
  frame-ancestors 'none';
```
This blocks inline scripts, external resource loading, and iframe embedding — significantly limiting XSS impact.

---

## P2 — Medium (Should Fix Before Wider Rollout)

### P2-1: localStorage Data Persistence After Logout

**Location:** §15 Oracle Recommendations — Gap #6; §9 Sound & Atmosphere (audio controls)  
**Risk:** The spec stores in localStorage:
- Camera position (pan offset, zoom level) — ✅ Low risk
- Panel states (sidebar open/closed) — ✅ Low risk
- Audio preferences (volume levels, mute state) — ✅ Low risk
- Last viewed tab — ✅ Low risk

Currently, these are all UI preferences — **low sensitivity**. However:

**Future risk:** If the state store (§11) or API client caches any of the following in localStorage (a common pattern for performance), it becomes a problem:
- Agent session data (activity, task labels)
- Bond affinity values
- Event feed history
- Replay state data
- API tokens or session cookies

**Impact:** If a user logs out (or a different user accesses the same browser), localStorage persists. Cached agent data, session info, or auth tokens would be accessible.

**Mitigation:**
1. **Whitelist localStorage keys** — Only store the 4 UI preference keys listed in the spec. Block all others
2. **Clear on logout** — Implement `localStorage.clear()` or selective key removal on logout
3. **No sensitive data** — Document that the state store (§11 "Lightweight store") must NEVER persist to localStorage. Use in-memory only for agent/bond/event state
4. **sessionStorage for transient data** — If caching is needed for performance, use `sessionStorage` (cleared when tab closes) instead of `localStorage`

---

### P2-2: Keyboard Shortcuts Could Interfere with Browser/Accessibility

**Location:** §8 Interactive Features — Keyboard Shortcuts  
**Risk:** Shortcuts like `Tab`, `Space`, `F`, `R`, `E`, `M`, and `1-8` override default browser behavior:
- `Tab` is critical for keyboard accessibility navigation
- `Space` scrolls the page
- `F` may trigger browser find (Ctrl+F false positive with modifier issues)

Not a direct security risk, but accessibility violations can be compliance issues (WCAG/ADA).

**Mitigation:**
1. **Only capture shortcuts when canvas is focused** — Don't capture global keyboard events
2. **Modifier keys** — Consider `Ctrl+1` through `Ctrl+8` instead of bare number keys
3. **Don't override Tab** — Use a different key for agent cycling
4. **Escape hatch** — Ensure `Esc` always works to return focus to normal page

---

### P2-3: Activity Mapper Regex Complexity

**Location:** §12 Data Integration — `activity-mapper.js`  
**Risk:** The activity mapper uses regex matching on session labels:
```javascript
{ match: /research|investigat|analyz|study/, activity: 'researching' },
```
If session labels can be arbitrarily long or crafted, complex regex patterns could cause ReDoS (Regular Expression Denial of Service) — though these specific patterns are simple alternations and unlikely to be vulnerable.

More concerning: the regex matching reveals the classification logic. If an attacker knows the patterns, they can craft session labels to trigger specific visual states (social engineering via the map).

**Mitigation:**
1. **Input length limit** — Cap session labels at 200 characters before regex matching
2. **Server-side classification** — Move activity classification to the API server, not the client. The client receives `activity: "researching"`, not the raw label + regex
3. **Default safely** — The current `return 'idle'` default is correct. Ensure no regex can throw

---

### P2-4: Sound File Integrity

**Location:** §9 Sound & Atmosphere  
**Risk:** Sound files are bundled assets (WAV/MP3 served from `/assets/audio/`). This is **safe by design** — no user upload vector. However:
- If the asset directory is writable and the server is compromised, an attacker could replace audio files
- Audio autoplay without explicit user interaction may be blocked by browsers (not a security risk, but a UX issue)

**Mitigation:**
1. **Serve assets read-only** — Asset directory permissions should be `r-xr-xr-x` (no write)
2. **Subresource integrity** — If loading audio from CDN, use SRI hashes
3. **User gesture for first audio** — Per browser policy, require a click before playing any audio (the spec's click-to-play voice lines handle this naturally)

---

### P2-5: Database Query Injection in Replay

**Location:** §12 Data Integration — SQL Queries; §11 API — `/api/replay/:timestamp`  
**Risk:** The replay endpoint takes a timestamp parameter. If this is interpolated directly into SQL queries without parameterization:
```sql
-- Dangerous if timestamp is not sanitized:
SELECT * FROM missions WHERE started_at <= '{timestamp}' AND completed_at > '{timestamp}'
```
SQL injection could expose or modify the entire database.

**Mitigation:**
1. **Parameterized queries** — Always use `?` placeholders, never string interpolation
2. **Input validation** — Validate timestamp format (ISO 8601) before any query
3. **Read-only DB connection** — The tactical map API should use a read-only database connection. It never needs to write
4. **Rate limit replay queries** — Replay state reconstruction is expensive. Limit to 10 requests/minute per user

---

## Safe by Design ✅

### S1: PixiJS Canvas Rendering (XSS Protection for In-Canvas Elements)
PixiJS renders to a `<canvas>` element. Text rendered via `PIXI.Text` is rasterized to pixels — it cannot execute HTML or JavaScript. This means **all in-canvas labels, tooltips drawn on canvas, and building names are inherently XSS-safe**. Only DOM-based panels (slide-ins, modals, HUD) need explicit sanitization.

### S2: Bundled Sound Assets (No User Upload)
§9 specifies pre-generated TTS audio files and bundled ambient tracks. No user-uploaded sounds. No dynamic audio URLs. The attack surface for audio is minimal.

### S3: Fixed Building Positions (No User-Controlled Layout)
§16 Question #2 confirms building positions are fixed, not user-draggable (for v1). This means no user-controlled coordinate injection that could cause layout attacks or off-screen element manipulation.

### S4: Read-Only Visualization
The tactical map is purely observational — it reads data and renders it. There are no write operations (no task creation, no mission assignment, no agent configuration from the map). This significantly limits the blast radius of any vulnerability.

### S5: Polling Architecture (10s/30s) Limits Real-Time Exposure
The primary data fetch mechanism is polling (`/api/agents/status` at 10s, `/api/bonds` at 30s), not persistent connections. This means even without WebSocket auth, the polling endpoints are standard HTTP requests that benefit from normal browser security (same-origin policy, cookie scoping, etc.).

### S6: Client-Side Only State Store
§11 specifies a "Lightweight store" for client state (agent states, bond states, UI state, replay state). As long as this stays in-memory (JavaScript variables) and is NOT persisted to localStorage/IndexedDB, it's safe — it's cleared on page navigation/refresh.

---

## Recommendations — Additional Hardening

### R1: Add Security Section to Spec (§11.5)
The spec needs an explicit security section covering:
- Authentication mechanism
- Authorization model (who can see what)
- CORS policy
- CSP headers
- Input sanitization strategy
- Transport security (HTTPS requirement)

### R2: HTTPS Only
The spec doesn't mention transport security. All API endpoints and WebSocket connections MUST use HTTPS/WSS. Add `Strict-Transport-Security` header.

### R3: Rate Limiting on All Endpoints
Add rate limiting to prevent abuse:
- `/api/agents/status`: 30 req/min (supports 10s polling with headroom)
- `/api/agents/:id/detail`: 20 req/min
- `/api/bonds`: 10 req/min
- `/api/replay/*`: 10 req/min
- WebSocket: 5 connections/user, 100 messages/min

### R4: Audit Logging
Log all API access with:
- Timestamp
- Authenticated user
- Endpoint accessed
- Source IP
- Response status

This is essential for incident response and detecting unauthorized access.

### R5: Implement a Data Classification Layer
Before any data reaches the frontend, it should pass through a classification filter:
- **Public:** Agent name, building type, overall status (IDLE/ACTIVE), KPI tier (high/medium/low)
- **Internal:** Session labels, task descriptions, message content, specific KPI values
- **Confidential:** Isolated session details, escalation descriptions, security events

The tactical map should default to showing only **Public** data. Authenticated admin users can opt into **Internal** visibility. **Confidential** data should never appear on the map.

### R6: Privacy-Preserving Activity Indicators
Instead of showing "Oracle — Researching: Phase 5 Spec Design (75%)", show:
- "Oracle — Active ● (1 task)" 
- Click for detail → authenticated panel shows more

This gives the tactical map its visual value (seeing who's active) without leaking what they're working on.

### R7: Feature Flags for Sensitive Components
Gate these behind feature flags:
- Replay mode (high data exposure)
- Message preview in click panels
- WebSocket real-time events
- Detailed KPI values

This allows shipping the map incrementally while keeping sensitive features behind admin-only toggles.

---

## Summary Matrix

| ID | Risk | Severity | Effort to Fix | Phase to Address |
|----|------|----------|---------------|-----------------|
| P0-1 | No API authentication | 🔴 Critical | 4-6h | Phase 5.1 |
| P0-2 | Isolated session exposure | 🔴 Critical | 2-3h | Phase 5.1 |
| P0-3 | XSS via task descriptions | 🔴 Critical | 2-4h | Phase 5.1 |
| P1-1 | WebSocket no auth/origin check | 🟠 High | 3-4h | Phase 5.4 |
| P1-2 | Replay unbounded data access | 🟠 High | 3-4h | Phase 5.6 |
| P1-3 | Message content in click panels | 🟠 High | 1-2h | Phase 5.4 |
| P1-4 | No CORS policy | 🟠 High | 1h | Phase 5.1 |
| P1-5 | No CSP headers | 🟠 High | 1h | Phase 5.1 |
| P2-1 | localStorage persistence | 🟡 Medium | 1-2h | Phase 5.1 |
| P2-2 | Keyboard shortcut conflicts | 🟡 Medium | 1h | Phase 5.4 |
| P2-3 | Activity mapper regex | 🟡 Medium | 1h | Phase 5.2 |
| P2-4 | Sound file integrity | 🟡 Medium | 0.5h | Phase 5.5 |
| P2-5 | SQL injection in replay | 🟡 Medium | 1-2h | Phase 5.6 |

**Total additional security effort: ~20-30 hours** across all phases (roughly 30-40% overhead on the current estimate). This is normal and expected for a data-rich visualization system.

---

## Conclusion

The tactical map is an impressive and well-structured design. The core architecture (PixiJS rendering, polling-based data, bundled assets, read-only visualization) provides a strong foundation. The **three P0 issues** (authentication, isolated session exposure, XSS) must be resolved in the spec before Phase 5.1 implementation begins — they're not things to "add later." 

The P1 issues should be addressed in each respective phase's implementation. The P2 issues can be tracked and resolved before wider rollout.

**My recommendation: Add §11.5 (Security Architecture) to the spec addressing P0-1 through P1-5 before any code is written.** The security model should be designed, not bolted on.

*"The shield holds only if forged before the battle."*  
— Sentinel, Photon Cannon

---

*Review complete. En Taro Adun.*
