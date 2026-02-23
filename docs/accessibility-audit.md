# Accessibility Audit — WCAG 2.1 AA

VentureOS accessibility audit and remediation status.

## Audit Summary

| Area | Status | Notes |
|------|--------|-------|
| **Color Contrast** | ✅ Fixed | `--text-muted` bumped from `#71717a` (3.73:1) to `#8e8e97` (5.78:1) |
| **Keyboard Navigation** | ✅ Fixed | All nav items focusable via `tabindex="0"`, Enter/Space activation |
| **Focus Indicators** | ✅ Fixed | Global `*:focus-visible` + custom nav item focus styles |
| **ARIA Labels** | ✅ Fixed | Nav items, search inputs, status bar, sidebar, canvas |
| **Screen Reader** | ✅ Fixed | `aria-live` regions for state changes, `aria-current="page"`, `sr-only` summaries |
| **Skip Navigation** | ✅ Added | Skip-to-content link on Dashboard |
| **Document Structure** | ✅ Verified | `lang="en"`, `<main>`, `<nav>`, `<aside>`, `<h1>` present |
| **Automated Testing** | ✅ Added | axe-core via Playwright, CI workflow |

## Changes Made

### Dashboard (`dashboard/client/index.html`)

#### Color Contrast (WCAG 1.4.3)
- **`--text-muted`**: Changed from `#71717a` to `#8e8e97`
  - Old ratio vs `#0a0a0f`: **3.73:1** ❌ (fails AA)
  - New ratio vs `#0a0a0f`: **5.78:1** ✅ (passes AA)
  - New ratio vs `#1f1f2e` (card bg): **4.82:1** ✅ (passes AA)

#### Keyboard Navigation (WCAG 2.1.1)
- All `.nav-item` elements now have `role="button"` and `tabindex="0"`
- Added `keydown` handler for Enter and Space to activate nav items
- Active nav item gets `aria-current="page"` (updated on navigation)

#### Focus Indicators (WCAG 2.4.7)
- Added global `*:focus-visible` rule: `outline: 2px solid var(--accent)`
- Nav items get custom focus style matching hover state plus outline
- Search box already had custom focus style (box-shadow + border-color)
- Added `.sr-only` utility class for screen-reader-only content

#### ARIA Labels (WCAG 4.1.2)
- Sidebar: `aria-label="Primary navigation"`
- Nav container: `aria-label="Dashboard pages"`
- Each nav item: `aria-label="<page name>"`
- Emoji icons: `aria-hidden="true"` (decorative)
- Search inputs: `aria-label="Search sessions"`, `"Search observations"`, `"Search live feed"`
- Status bar: `role="status"`, `aria-live="polite"`, `aria-label="System status"`
- Status indicator dot: `aria-hidden="true"`

#### Skip Navigation (WCAG 2.4.1)
- Added `.skip-to-content` link as first element in `<body>`
- Links to `#main-content` (id added to `<main>`)
- Visually hidden until focused

### Tactical Map (`tactical-map/`)

#### Canvas Accessibility (WCAG 1.1.1)
- Canvas element: `role="img"` + descriptive `aria-label`
- Application container: `role="application"` + `aria-label`

#### Screen Reader Support (WCAG 4.1.3)
- Added `#sr-announcements` region (`aria-live="polite"`, `aria-atomic="true"`)
  - Announces agent state changes (e.g., "oracle is now active")
- Added `#sr-agent-summary` region (`role="status"`)
  - Provides current agent status counts and keyboard shortcut hints
- Added `.sr-only` CSS class for visually-hidden screen reader content

### Automated Testing

#### axe-core Integration
- Installed `@axe-core/playwright` in tactical-map
- Test suites:
  - `tactical-map/tests/accessibility/wcag-aa.test.ts` — Tactical Map checks
  - `tests/accessibility/dashboard-wcag-aa.test.ts` — Dashboard checks

#### CI Workflow
- `.github/workflows/accessibility.yml` — runs on PRs touching tactical-map or dashboard
- Uses axe-core WCAG 2.1 AA ruleset
- Uploads results as artifacts

## Known Limitations

### Canvas-Based Rendering
The Tactical Map is a PixiJS WebGL/Canvas application. Canvas content is fundamentally opaque to screen readers. Our mitigations:

1. **ARIA live regions** announce state changes as text
2. **Status summary** provides a text overview of all agent states
3. **`role="img"`** on the canvas tells assistive tech it's a graphic
4. **Keyboard shortcut hints** are provided in the screen reader summary

A fully accessible alternative would require a parallel DOM-based view.

### Remaining WCAG Gaps

| Criterion | Gap | Priority | Follow-up |
|-----------|-----|----------|-----------|
| 1.1.1 Non-text Content | Canvas internals not individually describable | Medium | DOM-based alternative view |
| 1.4.11 Non-text Contrast | Canvas UI elements not verified | Low | Manual review needed |
| 2.1.1 Keyboard | Canvas interactions not keyboard-accessible | Medium | Keyboard controller |
| 2.4.3 Focus Order | Tab order within canvas not meaningful | Low | Requires DOM overlay |
| 3.3.2 Labels | Dynamically-generated tables lack `<th>` | Medium | Add to table generators |

## Running Accessibility Tests

```bash
# Tactical Map accessibility tests
cd tactical-map && npx playwright test tests/accessibility/

# Or from repo root
npm run test:a11y

# Dashboard tests (requires dashboard server running)
npx playwright test tests/accessibility/dashboard-wcag-aa.test.ts
```

## References

- [WCAG 2.1 AA Specification](https://www.w3.org/TR/WCAG21/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apd/)
