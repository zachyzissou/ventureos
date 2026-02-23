# Obsidian Conventions (VentureOS)

**Vault:** `VaultZap`  
**Root folder:** `VentureOS/`

Use Obsidian URI format for registry fields:

```
obsidian://open?vault=VaultZap&file=<URL-encoded path>
```

Example:
```
obsidian://open?vault=VaultZap&file=VentureOS%2FBusiness%20Units%2Fstantontimes-network%2FREADME
```

---

## Business Units (canonical notes)
**Canonical path** (entry point for the unit):

```
VentureOS/Business Units/<unit-id>/README
```

- `<unit-id>` must match the registry `id` (slug) to avoid drift.
- Additional unit notes can live alongside `README` (ops, brand kit, KPIs), but the canonical link always points to `README`.

---

## Missions (mission briefs + artifacts)
**Canonical mission path:**

```
VentureOS/Missions/<YYYY>/<MM>/<business-unit>/<mission-id>-<slug>
```

- Recommended `mission-id` format: `mission-YYYY-MM-DD` or `M-YYYYMMDD-###`.
- Use a single note at that path **or** a folder with a `README` for multi‑file missions.

Example:
```
VentureOS/Missions/2026/02/stantontimes-network/mission-2026-02-08-content-sprint
```

---

## Strategy (long‑lived direction)
**Canonical strategy path:**

```
VentureOS/Strategy/<business-unit>/README
```

Optional quarter plans:
```
VentureOS/Strategy/<business-unit>/<YYYY>-Q<q>
```

The canonical link should always point to the unit’s strategy `README`.
