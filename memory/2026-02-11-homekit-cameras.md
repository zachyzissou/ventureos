# 2026-02-11 — HomeKit Bridge Overhaul & Speco Camera Recon

## HomeKit Bridge Reset & Cleanup
- **Problem:** "Could not change settings" errors in Home app on patio fan whoosh switches; bridge was corrupted/overloaded.
- **Bridge entry_id:** `01KH0PTC9WSYR3RCYCGNXXR7T9` (port 21064, mode: bridge)
- **Domain trim:** Reduced bridge domains from 14 → 8; removed alarm_control_panel, humidifier, lawn_mower, vacuum, water_heater, remote.
- **Entity exclude list:** Added 22 entities — fan config switches (beep, LED, eco, motion sense, IR), Integra receivers, unused Jandy switches, utility fan/fan lights. Kept whoosh switches + fan entities.
- **Bridge re-pair:** Deleted `homekit.01KH0PTC9WSYR3RCYCGNXXR7T9.*` pairing files (backed up to `homekit_backup/` on HA), restarted HA core — user re-paired in Home app. Error resolved.
- **8 individual TV HomeKit accessories** (ports 21065-21072) for Study, Exercise, Theater, Master, Patio, Front Bed, Middle Bed, Living — NOT part of bridge, unaffected by reset.

## Entity Area Propagation
- **Problem:** HomeKit integration uses entity-level `area_id`, NOT device-level area inheritance. Most entities had no explicit area → all showed in "Default Room" in Home app.
- **Fix:** Built a jq device→area map and applied to `/config/.storage/core.entity_registry` using `--argjson devmap` + `map()` with `$e` variable capture. Propagated areas from 113 → 277 entities.
- **HomeKit rooms still manual:** HAP protocol doesn't support bridges declaring rooms — all accessories land in bridge's room (Equipment Room). User must manually drag to rooms in Home app.
- **Registry backups on HA:** `core.device_registry.bak`, `core.entity_registry.bak2`, `core.config_entries.bak`

## Roku Ultra Device Fix
- Renamed "Roke Middle Bed" → "Roku Middle Bed" in device registry
- Area corrected from `patio` → `middle_bed` (device `906589ddebffdd792fb3b67c808f711a`)

## Peekaboo vs Home App
- Peekaboo installed at `/opt/homebrew/bin/peekaboo`; Screen Recording permission granted ✅
- Accessibility shows ✅ in System Settings but Peekaboo reports ❌ (detection bug in Peekaboo)
- **Home app is a Catalyst (iPad) app** — no AX element detection possible via macOS Accessibility API. Cannot automate room assignment.

## Speco Blue Camera System
- **NVR:** `192.168.225.100` — Dahua-based firmware/web UI (Chinese comments in HTML, Dahua CSS/JS). Ports: 80, 554, 9008.
- **9 cameras** on same subnet, MAC OUI `5c:f2:07` (Speco Technologies).
- **Confirmed camera IPs (port scanned):** .123 (80, 554), .129 (80, 554, 9008), .135 (80, 554, 9008); 6 more with same OUI not yet scanned.
- **RTSP format:** `rtsp://<IP>:9008/profile1` (main stream), `profile2` (sub stream)
- **NVR RTSP pattern:** `/cam/realmonitor?channel=X&subtype=Y` (Dahua standard)
- **BLOCKED:** All RTSP streams return **401 Unauthorized**. Need credentials from user (check NVR web UI at `http://192.168.225.100` or Speco Blue mobile app settings).
- **Integration plan:** Once credentials obtained → test authenticated RTSP → add via HA ONVIF or Generic Camera integration → expose to HomeKit bridge.

## Big Ass Fans Reference
- Main Patio: `fan.main_patio_ceiling_fan` (device `46e5431030873558058bcb8ff6f00647`), area: patio
- By Master Bed: `fan.patio_ceiling_fan_by_master_bed` (device `fe8bea3aaab8f1bc690340d9dfae51a6`), area: patio
- Both are Turbo6 models.

## Three Orphan Control4 Lights
- sconce_s_2, sconce_s_3, LEDs — user unsure which rooms. Still unassigned.

## HA Areas Count
- 37 defined areas. Key: patio, middle_bed, pool, equipment_room, front_bedroom.

## Notable LAN Devices (for reference)
- Home Assistant: .132 (was .133)
- Synology NAS "Unit-01": .189
- Control4 controllers, Apple TVs, Roku devices
- Ubiquiti switches, two Mac Studios (one M4 Max)
- Resideo thermostats, Nest devices, Xbox
- Samsung TVs, Integra/Onkyo receivers
- SnapAV WattBox, Screen Innovations "Troy" (.??)
- Litter robot, ceiling fans (Espressif/Bond)
