#!/usr/bin/env python3
"""iAqualink ICL Pool Light Controller.

Controls Jandy iAqualink ICL color lights via the cloud API.
These lights (type=4) are not handled by the HA iaqualink integration.

Usage:
    pool_lights.py status                    # Get all light states
    pool_lights.py on <light>                # Turn on (Alpine White)
    pool_lights.py off <light>               # Turn off
    pool_lights.py set <light> <effect_id>   # Set color effect
    pool_lights.py effects                   # List available effects
    pool_lights.py all_on [effect_id]        # All lights on
    pool_lights.py all_off                   # All lights off

Light names: pool, spa, bubbler, sheer, all
Effect IDs: 0=Off, 1=Alpine White, 2=Sky Blue, 3=Cobalt Blue,
            4=Caribbean Blue, 5=Spring Green, 6=Emerald Green,
            7=Emerald Rose, 8=Magenta, 9=Violet, 10=Slow Splash,
            11=Fast Splash, 12=USA, 13=Fat Tuesday, 14=Disco Tech
"""

import asyncio
import json
import sys
import os

# Add iaqualink to path if needed
try:
    from iaqualink.client import AqualinkClient
except ImportError:
    sys.exit("ERROR: iaqualink package not installed. Run: pip3 install iaqualink")

CREDS_FILE = os.path.expanduser("~/.openclaw/credentials/iaqualink.json")

LIGHT_NAMES = {
    "pool": "Pool Lt",
    "spa": "Spa Lt",
    "bubbler": "Bubbler Lt",
    "sheer": "Sheer Lt",
}

EFFECTS = {
    0: "Off",
    1: "Alpine White",
    2: "Sky Blue",
    3: "Cobalt Blue",
    4: "Caribbean Blue",
    5: "Spring Green",
    6: "Emerald Green",
    7: "Emerald Rose",
    8: "Magenta",
    9: "Violet",
    10: "Slow Splash",
    11: "Fast Splash",
    12: "USA",
    13: "Fat Tuesday",
    14: "Disco Tech",
}

EFFECT_BY_NAME = {v.lower(): k for k, v in EFFECTS.items()}


def load_creds():
    if os.path.exists(CREDS_FILE):
        with open(CREDS_FILE) as f:
            return json.load(f)
    # Fall back to HA config
    ha_config = "/tmp/ha_config_entries.json"
    if os.path.exists(ha_config):
        with open(ha_config) as f:
            data = json.load(f)
        for entry in data["data"]["entries"]:
            if entry.get("domain") == "iaqualink":
                return {
                    "username": entry["data"]["username"],
                    "password": entry["data"]["password"],
                }
    sys.exit("ERROR: No credentials found")


async def get_status(system):
    """Get current light states from raw API response."""
    r = await system._send_devices_screen_request()
    raw = r.json()

    lights = {}
    for item in raw.get("devices_screen", []):
        if "response" in item:
            resp_str = item["response"]
            parts = resp_str.split("'")[3] if "'" in resp_str else ""
            fields = parts.split("|")

            # Lights are at the end: type|subtype|state|value|label groups
            # Find them by looking for type=4 groups
            i = len(fields) - 1
            while i >= 4:
                label = fields[i]
                if label in LIGHT_NAMES.values():
                    value = int(fields[i - 1]) if fields[i - 1].isdigit() else 0
                    state = int(fields[i - 2]) if fields[i - 2].isdigit() else 0
                    subtype = int(fields[i - 3]) if fields[i - 3].isdigit() else 0
                    typ = int(fields[i - 4]) if fields[i - 4].isdigit() else 0
                    lights[label] = {
                        "type": typ,
                        "subtype": subtype,
                        "state": state,
                        "value": value,
                        "effect": EFFECTS.get(state, f"Unknown ({state})"),
                        "is_on": state > 0,
                    }
                    i -= 5
                else:
                    i -= 1

    return lights


async def set_light(system, light_api_name, effect_id):
    """Set a light to a specific effect."""
    r = await system._send_session_request(
        "set_light", {"aux": light_api_name, "light": str(effect_id)}
    )
    return r.json()


async def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    creds = load_creds()

    async with AqualinkClient(creds["username"], creds["password"]) as client:
        await client.login()
        systems = await client.get_systems()
        system = list(systems.values())[0]
        await system.update()

        if cmd == "status":
            lights = await get_status(system)
            result = {}
            for api_name, data in lights.items():
                short = [k for k, v in LIGHT_NAMES.items() if v == api_name]
                key = short[0] if short else api_name
                result[key] = data
            print(json.dumps(result, indent=2))

        elif cmd == "effects":
            for eid, name in EFFECTS.items():
                print(f"  {eid:2d}: {name}")

        elif cmd == "on":
            light = sys.argv[2].lower() if len(sys.argv) > 2 else "all"
            effect = int(sys.argv[3]) if len(sys.argv) > 3 else 1
            if light == "all":
                for api_name in LIGHT_NAMES.values():
                    await set_light(system, api_name, effect)
                print(f"All lights ON ({EFFECTS.get(effect, effect)})")
            else:
                api_name = LIGHT_NAMES.get(light)
                if not api_name:
                    sys.exit(f"Unknown light: {light}. Use: {', '.join(LIGHT_NAMES.keys())}")
                await set_light(system, api_name, effect)
                print(f"{api_name} ON ({EFFECTS.get(effect, effect)})")

        elif cmd == "off":
            light = sys.argv[2].lower() if len(sys.argv) > 2 else "all"
            if light == "all":
                for api_name in LIGHT_NAMES.values():
                    await set_light(system, api_name, 0)
                print("All lights OFF")
            else:
                api_name = LIGHT_NAMES.get(light)
                if not api_name:
                    sys.exit(f"Unknown light: {light}. Use: {', '.join(LIGHT_NAMES.keys())}")
                await set_light(system, api_name, 0)
                print(f"{api_name} OFF")

        elif cmd == "set":
            if len(sys.argv) < 4:
                sys.exit("Usage: pool_lights.py set <light> <effect_id|effect_name>")
            light = sys.argv[2].lower()
            effect_arg = sys.argv[3].lower()
            
            # Accept either ID or name
            if effect_arg.isdigit():
                effect_id = int(effect_arg)
            else:
                effect_id = EFFECT_BY_NAME.get(effect_arg)
                if effect_id is None:
                    sys.exit(f"Unknown effect: {effect_arg}")

            if light == "all":
                for api_name in LIGHT_NAMES.values():
                    await set_light(system, api_name, effect_id)
                print(f"All lights set to {EFFECTS.get(effect_id, effect_id)}")
            else:
                api_name = LIGHT_NAMES.get(light)
                if not api_name:
                    sys.exit(f"Unknown light: {light}")
                await set_light(system, api_name, effect_id)
                print(f"{api_name} set to {EFFECTS.get(effect_id, effect_id)}")

        elif cmd in ("all_on",):
            effect = int(sys.argv[2]) if len(sys.argv) > 2 else 1
            for api_name in LIGHT_NAMES.values():
                await set_light(system, api_name, effect)
            print(f"All lights ON ({EFFECTS.get(effect, effect)})")

        elif cmd in ("all_off",):
            for api_name in LIGHT_NAMES.values():
                await set_light(system, api_name, 0)
            print("All lights OFF")

        else:
            print(f"Unknown command: {cmd}")
            print(__doc__)
            sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
