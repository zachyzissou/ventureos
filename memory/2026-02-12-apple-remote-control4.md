# Apple Remote Widget + Control4 TV Control — Research & Design

## Date: 2026-02-12

## Problem Statement
Control4 remotes handle TV navigation (d-pad, select, back, menu) through the Director → ZigBee/IR → source device chain. The goal is to replicate this functionality using the Apple Remote widget (iOS Control Center) for HomeKit-exposed TV accessories, so users can navigate Roku/AppleTV UIs from their iPhones without needing a physical C4 remote.

## Architecture Overview

### How HomeKit TV Remote Works
- HA exposes Control4 `media_player` entities as HomeKit TV accessories (accessory mode, one per room)
- iOS automatically shows the Apple Remote widget in Control Center for paired TV accessories
- **Built-in functions** (handled by C4 media_player, no extra work):
  - Power on/off (`select_source` / `turn_off`)
  - Source/input selection
  - Volume up/down (iPhone side buttons → C4 room zone → correct amp/TV)
  - Play/pause
- **Navigation functions** (NOT handled — need custom automations):
  - D-pad: up, down, left, right
  - Select / OK (center press)
  - Back
  - Info / Menu

### The `homekit_tv_remote_key_pressed` Event
When a button is pressed on the Apple Remote widget, HA fires an event:
```yaml
event_type: homekit_tv_remote_key_pressed
event_data:
  entity_id: media_player.middle_bed  # identifies WHICH TV
  key_name: arrow_right               # identifies WHICH button
```

Available `key_name` values:
| Apple Remote Button | `key_name` value |
|---|---|
| ↑ | `arrow_up` |
| ↓ | `arrow_down` |
| ← | `arrow_left` |
| → | `arrow_right` |
| Center/OK | `select` |
| Back | `back` |
| ⓘ Info | `information` |
| ⏯ Play/Pause | `play_pause` |

## Physical Device Inventory

### Roku Devices (Shared Sources)
| Name in C4 | Model | IP | MAC | Serial |
|---|---|---|---|---|
| Roku / Roku Apps | Roku Ultra | `192.168.225.166` | `50:06:F5:6D:F9:58` | X02800MHA7AX |
| Roku 2 / Roku Apps 2 | Roku Ultra | `192.168.225.139` | `50:06:F5:6D:F4:39` | X02800C8XEG9 |

- Both on firmware 15.1.4
- HTTP API confirmed reachable on port 8060 (no auth required)
- Both were at Home screen when tested

### Roku HTTP API — Keypress Mapping
```
POST http://<roku-ip>:8060/keypress/<key>
```
| Apple Remote `key_name` | Roku Keypress Endpoint |
|---|---|
| `arrow_up` | `/keypress/Up` |
| `arrow_down` | `/keypress/Down` |
| `arrow_left` | `/keypress/Left` |
| `arrow_right` | `/keypress/Right` |
| `select` | `/keypress/Select` |
| `back` | `/keypress/Back` |
| `information` | `/keypress/Info` or `/keypress/Home` |
| `play_pause` | `/keypress/Play` |

### Room → Source Sharing (AV Matrix)
Three rooms share the two Rokus via Control4 AV matrix switching:
- **Front Bedroom** — Roku or Roku 2
- **Middle Bed** — Roku or Roku 2
- **Patio** — Roku or Roku 2

All three can also be set to AppleTV Living or AppleTV Theater, but Rokus are the primary use.

### Volume Handling by Room
| Room | Audio Endpoint | Volume Path |
|---|---|---|
| Theater | Dedicated speaker system | C4 room zone → amp/receiver |
| Living | Dedicated speaker system | C4 room zone → amp/receiver |
| Patio | Dedicated speaker system | C4 room zone → amp/receiver |
| Exercise | TV internal speakers | C4 room zone → TV |
| Middle Bed | TV internal speakers | C4 room zone → TV |
| Front Bed | TV internal speakers | C4 room zone → TV |

**Volume is fully handled by C4** — the room zone knows which audio endpoint to control. No custom automations needed for volume.

## Proposed Solution: Template Automation

### Design
A single HA automation handles all rooms, all keys, both Rokus:

1. `homekit_tv_remote_key_pressed` event fires
2. Extract `entity_id` → identifies which room
3. Check that entity's `source` attribute → identifies which Roku (or AppleTV)
4. Map `key_name` → Roku keypress endpoint
5. POST to the correct Roku IP

### Source → IP Mapping
```yaml
# In automation or rest_command
Roku: 192.168.225.166
Roku Apps: 192.168.225.166
Roku 2: 192.168.225.139
Roku Apps 2: 192.168.225.139
```

### Shared Source Consideration
If two rooms are watching the same physical Roku simultaneously (matrix split), d-pad commands from either room go to the same device. This is identical behavior to the physical C4 remotes — the Roku has one UI, whoever navigates controls it. Not a bug; it's inherent to shared-source matrix systems.

## What Works Today vs What's Needed

| Function | Handled By | Status |
|---|---|---|
| Power on | C4 `select_source` | ✅ Works |
| Power off | C4 `turn_off` | ✅ Works |
| Source selection | C4 media_player sources | ✅ Works |
| Volume up/down | C4 room zone (auto-routes to amp or TV) | ✅ Works |
| Mute | C4 room zone | ✅ Works |
| Play/pause | C4 media_player | ✅ Works |
| D-pad navigation | Roku HTTP API via automation | ❌ Needs implementation |
| Select / OK | Roku HTTP API via automation | ❌ Needs implementation |
| Back | Roku HTTP API via automation | ❌ Needs implementation |
| Info / Menu | Roku HTTP API via automation | ❌ Needs implementation |

## HomeKit TV Accessory Status
| Room | Port | Status | Notes |
|---|---|---|---|
| Middle Bed | 21071 | ✅ loaded, paired | Working now |
| Front Bed | 21070 | ❌ not_loaded | Needs enabling + pairing |
| Patio | 21069 | ❌ not_loaded | Needs enabling + pairing |
| Study | 21065 | ❌ not_loaded | No Roku source |
| Exercise | 21066 | ❌ not_loaded | Could benefit later |
| Theater | 21067 | ❌ not_loaded | Could benefit later |
| Master | 21068 | ❌ not_loaded | Could benefit later |
| Living | 21072 | ❌ not_loaded | Could benefit later |

**Minimum for Roku remote control:** Enable + pair Front Bed (21070) and Patio (21069) alongside existing Middle Bed (21071).

## Implementation Steps (When Ready)
1. Create `rest_command` entries in HA for each Roku keypress
2. Create single template automation listening to `homekit_tv_remote_key_pressed`
3. Automation logic: event → entity_id → source attribute → Roku IP → keypress POST
4. Enable HomeKit accessories for Front Bed and Patio (ports 21070, 21069)
5. Pair all three in Apple Home app
6. Test navigation on all three rooms with both Rokus
7. (Optional) Add AppleTV remote entity mapping for AppleTV sources

## Alternatives Considered

### Control4 Director API
- Could send commands via `POST /api/v1/items/{item_id}/commands` to source devices
- Pro: C4 handles source routing automatically
- Con: Bearer token expires, needs refresh logic; more complex; couples to C4
- **Verdict: Not recommended** — Roku direct API is simpler and more reliable

### Home Connect for Apple Home (Commercial C4 Driver)
- Third-party driver (~$100-200) by Automated Now
- Bridges C4 to HomeKit natively via Homebridge/HOOBS
- Requires C4 dealer to install
- **Verdict: Overkill** — we already have HomeKit integration via HA

### Direct Roku Integration in HA
- HA has a native Roku integration that creates `remote` and `media_player` entities
- Could use `remote.send_command` instead of raw HTTP
- Pro: More "HA native" approach
- Con: Adds integration overhead, still need the same automation logic
- **Verdict: Possible alternative** — but `rest_command` to port 8060 is dead simple and dependency-free

## Key References
- HA HomeKit Bridge docs: https://www.home-assistant.io/integrations/homekit/
- Roku External Control Protocol (ECP): port 8060, no auth
- pyControl4 API: https://lawtancool.github.io/pyControl4/
- Control4 HA integration: https://www.home-assistant.io/integrations/control4/
