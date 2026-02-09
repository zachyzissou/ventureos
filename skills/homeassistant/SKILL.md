---
name: homeassistant
description: Control and query Home Assistant via the REST API. Use when the user asks to turn devices on/off, set climate/media settings, run automations/scripts, or check entity states and attributes in Home Assistant.
---

# Home Assistant (REST)

## Overview
Use the REST API to list entities, read state/attributes, and call services (turn_on, set_temperature, etc.).

## Quick start

Credentials live at:
`/Users/zachgonser/.openclaw/credentials/homeassistant.json`

Run the helper script:
```bash
/Users/zachgonser/clawd/skills/homeassistant/scripts/ha.sh states
/Users/zachgonser/clawd/skills/homeassistant/scripts/ha.sh state sensor.kitchen_temperature
/Users/zachgonser/clawd/skills/homeassistant/scripts/ha.sh service light turn_on '{"entity_id":"light.kitchen"}'
```

You can override creds with env vars:
```bash
HA_URL=http://host:8123 HA_TOKEN=... ha.sh states
```

## Tasks

### 1) List entities
```bash
ha.sh states
```
Use this to discover entity_id values.

### 2) Read a single entity
```bash
ha.sh state <entity_id>
```
Check `state` and `attributes`.

### 3) Call a service
```bash
ha.sh service <domain> <service> '<json>'
```
Examples:
```bash
ha.sh service light turn_off '{"entity_id":"light.bedroom"}'
ha.sh service climate set_temperature '{"entity_id":"climate.downstairs","temperature":72}'
```

## Safety / hygiene
- Never echo or log the token.
- Do not commit credentials; they live outside the repo.

## References
- API endpoints: `references/ENDPOINTS.md`
