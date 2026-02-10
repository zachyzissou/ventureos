#!/usr/bin/env python3
"""Pool Lights HTTP API Server.

Lightweight HTTP server that proxies iAqualink pool light commands.
Runs on the Mac and is called by HA's rest_command/rest sensor.

Endpoints:
    GET  /status           - Get all light states (JSON)
    POST /set              - Set light: {"light": "pool", "effect": 4}
    POST /on               - Turn on: {"light": "pool"} (default Alpine White)
    POST /off              - Turn off: {"light": "pool"}
    POST /all_on           - All on: {"effect": 4}
    POST /all_off          - All off

Runs on port 8470 by default.
"""

import asyncio
import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

try:
    from iaqualink.client import AqualinkClient
except ImportError:
    sys.exit("ERROR: pip3 install iaqualink")

CREDS_FILE = os.path.expanduser("~/.openclaw/credentials/iaqualink.json")
PORT = 8470

LIGHT_NAMES = {
    "pool": "Pool Lt",
    "spa": "Spa Lt",
    "bubbler": "Bubbler Lt",
    "sheer": "Sheer Lt",
}

EFFECTS = {
    0: "Off", 1: "Alpine White", 2: "Sky Blue", 3: "Cobalt Blue",
    4: "Caribbean Blue", 5: "Spring Green", 6: "Emerald Green",
    7: "Emerald Rose", 8: "Magenta", 9: "Violet", 10: "Slow Splash",
    11: "Fast Splash", 12: "USA", 13: "Fat Tuesday", 14: "Disco Tech",
}

# Cache to avoid hammering the API
_cache = {"lights": {}, "ts": 0}
CACHE_TTL = 10  # seconds


def load_creds():
    with open(CREDS_FILE) as f:
        return json.load(f)


async def _get_system():
    creds = load_creds()
    client = AqualinkClient(creds["username"], creds["password"])
    await client.login()
    systems = await client.get_systems()
    system = list(systems.values())[0]
    await system.update()
    return client, system


async def get_status(force=False):
    now = time.time()
    if not force and _cache["lights"] and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["lights"]

    client, system = await _get_system()
    try:
        r = await system._send_devices_screen_request()
        raw = r.json()
        lights = {}

        for item in raw.get("devices_screen", []):
            if "response" in item:
                parts = item["response"].split("'")[3] if "'" in item["response"] else ""
                fields = parts.split("|")
                i = len(fields) - 1
                while i >= 4:
                    label = fields[i]
                    if label in LIGHT_NAMES.values():
                        state = int(fields[i - 2]) if fields[i - 2].isdigit() else 0
                        value = int(fields[i - 1]) if fields[i - 1].isdigit() else 0
                        short = [k for k, v in LIGHT_NAMES.items() if v == label]
                        key = short[0] if short else label
                        lights[key] = {
                            "state": state,
                            "value": value,
                            "effect": EFFECTS.get(state, f"Unknown ({state})"),
                            "is_on": state > 0,
                        }
                        i -= 5
                    else:
                        i -= 1

        _cache["lights"] = lights
        _cache["ts"] = now
        return lights
    finally:
        await client.close()


async def set_light_effect(light_key, effect_id):
    client, system = await _get_system()
    try:
        if light_key == "all":
            for api_name in LIGHT_NAMES.values():
                await system._send_session_request(
                    "set_light", {"aux": api_name, "light": str(effect_id)}
                )
        else:
            api_name = LIGHT_NAMES.get(light_key)
            if not api_name:
                return {"error": f"Unknown light: {light_key}"}
            await system._send_session_request(
                "set_light", {"aux": api_name, "light": str(effect_id)}
            )
        _cache["ts"] = 0  # Invalidate cache
        return {"ok": True, "light": light_key, "effect": EFFECTS.get(effect_id, effect_id)}
    finally:
        await client.close()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress access logs

    def _respond(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        if self.path == "/status":
            try:
                lights = asyncio.run(get_status())
                self._respond(200, lights)
            except Exception as e:
                self._respond(500, {"error": str(e)})
        elif self.path == "/health":
            self._respond(200, {"ok": True})
        else:
            self._respond(404, {"error": "Not found"})

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_len)) if content_len > 0 else {}

        try:
            if self.path == "/set":
                light = body.get("light", "all")
                effect = int(body.get("effect", 1))
                result = asyncio.run(set_light_effect(light, effect))
                self._respond(200, result)

            elif self.path == "/on":
                light = body.get("light", "all")
                effect = int(body.get("effect", 1))
                result = asyncio.run(set_light_effect(light, effect))
                self._respond(200, result)

            elif self.path == "/off":
                light = body.get("light", "all")
                result = asyncio.run(set_light_effect(light, 0))
                self._respond(200, result)

            elif self.path == "/all_on":
                effect = int(body.get("effect", 1))
                result = asyncio.run(set_light_effect("all", effect))
                self._respond(200, result)

            elif self.path == "/all_off":
                result = asyncio.run(set_light_effect("all", 0))
                self._respond(200, result)

            else:
                self._respond(404, {"error": "Not found"})
        except Exception as e:
            self._respond(500, {"error": str(e)})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Pool Lights API running on port {port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
