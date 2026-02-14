# ventureos-rpg Web Components

Standalone, framework-agnostic Web Components used by the VentureOS dashboard.

All components are plain **Vanilla Web Components** (no framework). Load with:

```html
<script type="module" src="/rpg/components/index.js"></script>
```

## `<psionic-attribute-bar>`
Displays a single psionic attribute bar.

Attributes:
- `agent` (string) — optional (theming hook)
- `attribute` (string) — `WIS|SPD|TRU|CRE|RCH`
- `value` (number, 0-100)
- `label` (string)

Example:
```html
<psionic-attribute-bar agent="oracle" attribute="WIS" value="85" label="Psionic Mastery"></psionic-attribute-bar>
```

## `<tactical-overlay-panel>`
Protoss-style unit card for an agent.

Attributes:
- `agent` (string)

Fetches:
- `/api/rpg/tactical-overlay/<agent>`

## `<khala-network-graph>`
D3 force-directed graph of Khala bonds.

Fetches:
- `/api/rpg/khala-network`

Features:
- Edge thickness scales with affinity
- Filter slider (affinity threshold)
- Hover tooltip shows drift history
- Click edge shows bond detail payload

## `<atlas-reliability-metrics>`
Atlas-specific reliability panel.

Attributes:
- `agent` (string, default `atlas`)

Fetches:
- `/api/rpg/stats/<agent>`
