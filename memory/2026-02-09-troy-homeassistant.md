# 2026-02-09 — Screen Innovations Troy + Home Assistant Integration

## Troy Gateway Discovery
- **Troy device**: `192.168.225.172` (`troy.lan`), Screen Innovations TRO.Y 2 gateway
- **Firmware**: 3.23 (Oct 19 2023)
- **Protocol**: HTTP CGI API on port 80 (lwIP/2.0.3), telnet on port 23
- **CGI API is completely unauthenticated** — no password needed for motor control or device queries
- **UI/Telnet password**: `CBC0ntrol4U` (discovered via unauthenticated `cmd=31` endpoint)
- **Telnet credentials**: username `Telnet1`, password `CBC0ntrol4U`
- Control4 controls shades through Troy's telnet interface using these same credentials

## Troy CGI API Reference
- `cmd=32` — list device indexes
- `cmd=2&int1=<index>` — get device entry (label, assignedID, nativeID, type)
- `cmd=70&str1=<assignedID>&str2=UP|DOWN|STOP` — motor control (UP=open, DOWN=close)
- `cmd=49&str1=<SDN_message>` — raw SDN message (position read/write)
- `cmd=31` — get telnet settings (username/password/port)
- `cmd=34` — check bypass mode
- `cmd=35` — firmware info
- `cmd=36&str1=<password>` — validate UI password
- Position reading: `cmd=49&str1=0C0B00010000<reversed_nativeID>0000&str2=0D&str3=<nativeID>`
- Position in response: `rawSDN[22:24]` hex byte, Troy scale: 0=open, 100=closed
- C4 scale (used in HA): 100=open, 0=closed (inverted from Troy)

## Device Table (all shades)
| Label | Assigned ID | Native ID | Type | Endpoint |
|-------|-------------|-----------|------|----------|
| Exercise | 00100B | 13B598 | motor | SDNx |
| Front Bed | 001001 | 13B59F | motor | SDNx |
| Garage Shade | 00100D | 08D28D | motor | SDNx |
| Library | 001009 | 13B59C | motor | SDNx |
| Master | 001007 | 13B592 | motor | SDNx |
| Rear Bed (Middle Bed) | 001003 | 13B265 | motor | SDNx |
| Study | 001005 | 13B599 | motor | SDNx |
| Laundry | 001006 | 4CC206FFFE811B04 | motor | Tahoma0/Zigbee |
| Library Door | 00100F | 4CC206FFFE820C2B | motor | Tahoma0/Zigbee |
| Master Door | 001004 | 4CC206FFFE820C05 | motor | Tahoma0/Zigbee |

## Helen Wireless Bridge
- Helen coordinator online, connected to Troy
- Zigbee devices: Laundry (motor), Laundry Repeater (onOff/AC), Library Door (motor), Library Repeater (onOff, OFFLINE), Master Door (motor)
- LinkPro bridge: disabled

## Home Assistant Integration
- **HA version**: 2026.2.1 (HA OS with Supervisor)
- **HA host**: `192.168.225.133:8123`, token in `~/.openclaw/credentials/homeassistant.json`
- **SSH access**: key-based via `~/.ssh/ha_ed25519` to `root@192.168.225.133` (Terminal & SSH add-on installed+configured)
- **SSH creds**: saved at `~/.openclaw/credentials/ha-ssh.json`
- **Configuration**: `/config/configuration.yaml` updated with:
  - `rest_command` services: `troy_shade_up`, `troy_shade_down`, `troy_shade_stop` (parameterized by `aid`)
  - `rest` sensors polling Troy CGI every 30s for each shade position
  - `template` covers (modern format, `position:` not `position_template:`) for all 7 SDN shades
- **Cover entities**: `cover.troy_rear_bed`, `cover.troy_front_bed`, `cover.troy_master`, `cover.troy_study`, `cover.troy_library`, `cover.troy_exercise`, `cover.troy_garage_shade`
- **Existing Bond covers**: `cover.patio_1` through `cover.patio_4` (patio shades via Bond Bridge Pro)
- **Control4 integration**: has `control4.light`, `control4.climate`, `control4.media_player` but NOT cover

## Troy CLI Script
- `/Users/zachgonser/clawd/skills/homeassistant/scripts/troy.sh` — Python script for shade control
- Commands: `list`, `status <shade>`, `open <shade>`, `close <shade>`, `stop <shade>`, `set <shade> <percent>`
- Uses C4 scale: 100=open, 0=closed

## Credentials Stored
- `~/.openclaw/credentials/troy.json` — Troy host, telnet creds, UI password, full device map
- `~/.openclaw/credentials/ha-ssh.json` — HA SSH password (key auth also configured)
- `~/.openclaw/credentials/homeassistant.json` — HA long-lived token (owner+admin)

## HA Entity Room Assignments (101 entities assigned)
- Assigned all Troy covers, Bond patio covers, thermostats, media players, and 75+ lights to HA areas
- East End Thermostat → Garage Hall, West End Thermostat → Laundry Hall
- Garage Shade renamed to "Garage West Shade", assigned to Garage West
- `cover.troy_library` still unassigned (no Library area exists)

## HomeKit Bridge
- HASS Bridge (port 21064) active — exposes all cover, light, climate, media_player, switch, fan, lock domains
- Per-room accessory bridges exist but all disabled except Middle Bed (which is redundant)
- **Problem**: Most devices land in "Default Room" in HomeKit because HA area names don't exactly match HomeKit room names
- **Middle Bedroom** is correctly populated (Govee lights, HomePod, shade, side table)
- HomeKit rooms visible: Middle Bedroom, Default Room, Dining Room, East Garage Hallway, Entrance, Equipment Room, Exercise Room, Foyer, Front Bedroom, Garage East, Garage West, Hallway, Kitchen + more
- User's goal: get everything expertly integrated into HomeKit for parents
- User said "don't change anything yet" re: HomeKit room assignments — waiting for go-ahead

## Peekaboo
- Installed on Mac Studio at `/opt/homebrew/bin/peekaboo` (v3.0.0-beta3)
- Can capture Home app UI but AXorcist detects 0 interactive elements (Home app accessibility limitation)
- Need full path `/opt/homebrew/bin/peekaboo` when running via nodes
