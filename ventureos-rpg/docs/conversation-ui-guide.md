# Phase 4 Track 5: Conversation UI & Visualization

## Overview

Live multi-agent conversation display integrated into the VentureOS dashboard.
Built as Web Components matching the existing Pylon Network architecture.

**Dashboard URL:** http://192.168.225.149:7001 → "Conversations" nav item

---

## Components

### 1. `<agent-sprite>` — Pixel Art Avatars

**File:** `components/agent-sprites.js`

8 Protoss-themed pixel art sprites at 16×16 grid (scaled to any size).

| Agent | Protoss Unit | Primary Color |
|-------|-------------|---------------|
| echo | Artanis | Gold (#FFD700) |
| nexus | Nexus | Crystal Teal (#00BFA5) |
| oracle | Zeratul | Void Purple (#9C27B0) |
| atlas | Probe | Cyan (#00E5FF) |
| sentinel | Sentinel | Blue (#2979FF) |
| verifier | Observer | Green (#00E676) |
| archivist | High Templar | Amber (#FF6F00) |
| synth | Dark Templar | Deep Purple (#311B92) |

**Attributes:**
- `agent` — Agent ID (required)
- `state` — `idle` | `speaking` | `processing` (animations differ)
- `size` — Pixel size (default: 64)
- `show-label` — Show agent name below sprite
- `status` — Status dot: `active` | `idle` | `rate-limited` | `paused`

**Animation States:**
- **idle** — Subtle float (3s ease-in-out loop)
- **speaking** — Pulse + bounce with glow (0.6s loop)
- **processing** — Shimmer with brightness oscillation (1.2s loop)

```html
<agent-sprite agent="oracle" state="speaking" size="64" show-label status="active"></agent-sprite>
```

### 2. `<live-conversation-panel>` — Main Display

**File:** `components/live-conversation-panel.js`

Full-featured conversation viewer with:
- **Participant sidebar** — Agent sprites + status + turn indicators
- **Message feed** — Chronological, grouped by speaker, auto-scrolling
- **Affinity visualizer** — Khala bond strength bars between participants
- **Type badges** — Fact (📋 cyan), Action (⚡ orange), Decision (✅ green), Question (❓ purple)
- **Security indicators** — Voice RULES violations (red warnings), injection score color coding
- **Typing indicator** — Shows current speaker composing

**Attributes:**
- `api-base` — API endpoint base URL (default: same origin)
- `poll-ms` — Polling interval in ms (default: 3000)
- `max-messages` — Max messages to display (default: 100)

**Mobile responsive:** Sidebar collapses to horizontal strip on screens < 640px.

```html
<live-conversation-panel poll-ms="3000" max-messages="100"></live-conversation-panel>
```

---

## API Endpoints

**Base:** `/api/rpg/conversations/`

### List Active Conversations
```
GET /api/rpg/conversations/active
→ { ok: true, conversations: [{ id, title, status, created_at, updated_at }] }
```

### Get Conversation Detail
```
GET /api/rpg/conversations/:id
→ { ok: true, conversation: {
    id, title, status,
    participants: [{ agent, status, last_active }],
    messages: [{ id, agent, type, text, timestamp, violations, injectionScore }],
    currentSpeaker: "oracle" | null,
    queue: ["synth", "atlas"],
    affinities: [{ a, b, value }]
  }}
```

### Create Conversation
```
POST /api/rpg/conversations
Body: { id?, title, participants: ["oracle", "atlas", ...] }
→ { ok: true, id, title }
```

### Add Message
```
POST /api/rpg/conversations/:id/messages
Body: { agent, type, text, injectionScore?, violations?: string[] }
→ { ok: true, id }
```

### Get Messages (Paginated)
```
GET /api/rpg/conversations/:id/messages?limit=50&before=ISO_TIMESTAMP
→ { ok: true, messages: [...] }
```

### Update Turn State
```
PUT /api/rpg/conversations/:id/turn
Body: { currentSpeaker: "oracle", queue: ["synth"] }
→ { ok: true }
```

### Update Participant Status
```
PUT /api/rpg/conversations/:id/participants/:agent
Body: { status: "active" | "idle" | "rate-limited" | "paused" }
→ { ok: true }
```

---

## Message Types

| Type | Icon | Color | Use |
|------|------|-------|-----|
| `fact` | 📋 | Cyan | Observations, data, findings |
| `action` | ⚡ | Orange | Tasks performed, changes made |
| `decision` | ✅ | Green | Approvals, choices, rulings |
| `question` | ❓ | Purple | Questions, proposals |

---

## Injection Score Levels

| Range | Level | Color | Meaning |
|-------|-------|-------|---------|
| 0-0.29 | low | Green | Safe — no injection detected |
| 0.30-0.59 | medium | Yellow | Warning — possible injection |
| 0.60-0.79 | high | Orange | Elevated — likely injection |
| 0.80-1.0 | critical | Red | Critical — confirmed injection |

---

## Database Schema

Tables added to `ventureos-rpg.db`:

```sql
conversations (id, title, status, created_at, updated_at, metadata)
conversation_participants (conversation_id, agent, status, joined_at, last_active)
conversation_messages (id, conversation_id, agent, type, text, timestamp, injection_score, violations, metadata)
conversation_turn_state (conversation_id, current_speaker, queue, updated_at)
```

Affinity data sourced from existing `khala_network` table.

---

## Integration with Synth's Conversation Engine

The conversation engine (Track 5 - Synth) should:

1. **Create conversations** via `POST /api/rpg/conversations`
2. **Post messages** via `POST /api/rpg/conversations/:id/messages`
3. **Update turns** via `PUT /api/rpg/conversations/:id/turn`
4. **Update participant status** via `PUT /api/rpg/conversations/:id/participants/:agent`

The UI polls these endpoints every 3 seconds and updates automatically.

For WebSocket upgrade (future): Replace polling with `wss://` connection on `/ws/conversations/:id`.

---

## File Structure

```
ventureos-rpg/
├── api/
│   ├── conversation-http.js   ← NEW: Conversation API routes
│   └── rpg-http.js            ← Existing RPG stats routes
├── components/
│   ├── agent-sprites.js       ← NEW: 2D pixel art sprite system
│   ├── live-conversation-panel.js  ← NEW: Conversation display
│   ├── index.js               ← Updated: imports new components
│   ├── khala-network-graph.js ← Existing
│   └── ...
└── docs/
    └── conversation-ui-guide.md  ← This file
```

Dashboard changes:
- `openclaw-dashboard/index.html` — Added Conversations nav + page section
- `openclaw-dashboard/server.js` — Added conversation API route handler
