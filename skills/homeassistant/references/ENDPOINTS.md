# Home Assistant REST Quick Reference

Base URL: `http://<host>:8123`

## Core endpoints

- **List all entity states**
  - `GET /api/states`

- **Get one entity state**
  - `GET /api/states/<entity_id>`

- **Call a service**
  - `POST /api/services/<domain>/<service>`
  - Body: JSON payload (usually includes `entity_id`)

## Common domains/services

- `light/turn_on`, `light/turn_off`
- `switch/turn_on`, `switch/turn_off`
- `climate/set_temperature`
- `media_player/volume_set`, `media_player/media_play`, `media_player/media_pause`

## Auth

Use `Authorization: Bearer <long-lived token>` header.
