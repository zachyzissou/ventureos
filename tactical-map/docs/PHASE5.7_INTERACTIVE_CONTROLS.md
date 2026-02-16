# Phase 5.7 — Interactive Controls

## Summary

Phase 5.7 adds user-driven interactive controls to the tactical map:
agent selection (click/keyboard), hover tooltips, a detail panel for
the selected agent, a minimap for navigation, and keyboard shortcuts.
All new features integrate with the existing Phase 5.1–5.6 renderer,
store, and data layers.

---

## Components

### 1. Selection System (`src/interaction/selection.ts`)

Click on a building to select it. Selection state is a store so all
renderers can react to the currently selected agent.

**Features:**
- Click building → select, click again → deselect
- Keyboard 1-8 → select agent by ring order
- Escape → deselect
- Tab → cycle through agents
- Selection ring rendered in world space (golden glow)

### 2. Tooltip Overlay (`src/interaction/tooltip.ts`)

Hover over a building to see a floating stats card (PixiJS overlay).

**Content:**
- Agent name + status dot
- CPU / Memory bars
- Latency, Req/s
- Active sessions count
- Current alert level

### 3. Detail Panel (`src/interaction/detail-panel.ts`)

When an agent is selected, a side panel slides in showing:
- Full stats (CPU, memory, latency, req/s, error rate)
- Sparklines for key metrics
- Active sessions list
- Recent errors
- Active alerts for this agent
- Uptime + last heartbeat

### 4. Minimap (`src/interaction/minimap.ts`)

Bottom-right corner, small overview of the entire map showing:
- Agent positions as colored dots (color = status)
- Camera viewport rectangle
- Click on minimap to navigate camera

### 5. Keyboard Manager (`src/interaction/keyboard.ts`)

Centralized keyboard handler that doesn't conflict with existing
camera shortcuts:
- `1`–`8`: Select agent by index
- `Escape`: Deselect / close panels
- `Tab`: Cycle selection
- `H`: Toggle health dashboard
- `M`: Toggle minimap
- `D`: Toggle detail panel
- `?`: Toggle help overlay

### 6. Config additions (`src/config.ts`)

```typescript
export const SELECTION = {
  RING_RADIUS: 62,
  RING_COLOR: 0xffd700,
  RING_ALPHA: 0.9,
  RING_WIDTH: 3,
  PULSE_HZ: 0.8,
} as const;

export const TOOLTIP = {
  WIDTH: 200,
  PADDING: 10,
  OFFSET_Y: -90,
  SHOW_DELAY_MS: 300,
  BG_COLOR: 0x0a0a1a,
  BG_ALPHA: 0.92,
  BORDER_COLOR: 0x00d4ff,
  BORDER_ALPHA: 0.6,
} as const;

export const DETAIL_PANEL = {
  WIDTH: 340,
  ANIM_MS: 200,
  BG_COLOR: 0x05070d,
  BG_ALPHA: 0.94,
} as const;

export const MINIMAP = {
  SIZE: 160,
  MARGIN: 12,
  BG_COLOR: 0x05070d,
  BG_ALPHA: 0.8,
  DOT_RADIUS: 5,
  VIEWPORT_COLOR: 0xffd700,
  VIEWPORT_ALPHA: 0.5,
} as const;
```

---

## Integration with main.ts

```typescript
// new stores
const selectionStore = createStore<SelectionState>({ selectedId: null, hoveredId: null });

// new layers
const tooltip = createTooltipOverlay();
const detailPanel = createDetailPanel();
const minimap = createMinimap();
const selectionRing = createSelectionRing();
const keyboard = createKeyboardManager({ selectionStore, camera, ... });

// wire building clicks
buildingsLayer.onSelect((id) => selectionStore.update(...));
buildingsLayer.onHover((id) => selectionStore.update(...));
```

---

## Performance Budget

| Metric | Target |
|--------|--------|
| Selection ring render | < 0.5ms/frame |
| Tooltip render | < 0.5ms/frame |
| Detail panel render | < 1ms/frame |
| Minimap render | < 1ms/frame |
| Keyboard handler | < 0.1ms/event |

---

## Test Strategy

- Unit tests for selection store, keyboard bindings, tooltip logic
- Integration tests for selection → detail panel data flow
- E2E visual tests for tooltip appearance, detail panel content
