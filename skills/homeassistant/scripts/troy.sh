#!/usr/bin/env python3
"""troy.sh — Control Screen Innovations shades via Troy CGI API

Usage:
  troy.sh list                      # list all shades
  troy.sh status <shade>            # get position (100=open, 0=closed)
  troy.sh open <shade>              # fully open
  troy.sh close <shade>             # fully close
  troy.sh stop <shade>              # stop movement
  troy.sh set <shade> <percent>     # set position (100=open, 0=closed)

<shade> can be: rear_bed, front_bed, master, study, library, exercise,
  garage_shade, laundry, library_door, master_door
"""

import sys, json, time, urllib.request, urllib.error

TROY_HOST = "192.168.225.172"
TROY_URL = f"http://{TROY_HOST}"

DEVICES = {
    "exercise":     {"aid": "00100B", "nid": "13B598",  "label": "Exercise",     "type": "SDNx"},
    "front_bed":    {"aid": "001001", "nid": "13B59F",  "label": "Front Bed",    "type": "SDNx"},
    "garage_shade": {"aid": "00100D", "nid": "08D28D",  "label": "Garage Shade", "type": "SDNx"},
    "library":      {"aid": "001009", "nid": "13B59C",  "label": "Library",      "type": "SDNx"},
    "master":       {"aid": "001007", "nid": "13B592",  "label": "Master",       "type": "SDNx"},
    "rear_bed":     {"aid": "001003", "nid": "13B265",  "label": "Rear Bed",     "type": "SDNx"},
    "study":        {"aid": "001005", "nid": "13B599",  "label": "Study",        "type": "SDNx"},
    "laundry":      {"aid": "001006", "nid": "4CC206FFFE811B04", "label": "Laundry",      "type": "Tahoma0"},
    "library_door": {"aid": "00100F", "nid": "4CC206FFFE820C2B", "label": "Library Door", "type": "Tahoma0"},
    "master_door":  {"aid": "001004", "nid": "4CC206FFFE820C05", "label": "Master Door",  "type": "Tahoma0"},
}


def cgi(params: str, timeout: float = 5) -> dict:
    url = f"{TROY_URL}/troy.cgi?{params}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def byte_reverse(nid: str) -> str:
    """Reverse byte order of 6-char hex ID."""
    return nid[4:6] + nid[2:4] + nid[0:2]


def resolve(name: str) -> dict:
    key = name.lower().replace(" ", "_").replace("-", "_")
    if key in DEVICES:
        return DEVICES[key]
    # Try matching by assignedID
    for d in DEVICES.values():
        if d["aid"].lower() == name.lower():
            return d
    print(f"Unknown shade: {name}", file=sys.stderr)
    print(f"Available: {', '.join(sorted(DEVICES.keys()))}", file=sys.stderr)
    sys.exit(1)


def read_position(dev: dict):
    """Read position as C4 percent (100=open, 0=closed). Returns None if unreadable."""
    nid = dev["nid"]
    if len(nid) != 6:
        return None  # Zigbee devices — position read not supported via SDN
    rev = byte_reverse(nid)
    msg = f"0C0B00010000{rev}0000"
    resp = cgi(f"cmd=49&str1={msg}&str2=0D&str3={nid}")
    raw = resp.get("rawSDN", "")
    if not raw or len(raw) < 26:
        return None
    troy_pct = int(raw[22:24], 16)  # 0=open, 100=closed
    return 100 - troy_pct  # C4: 100=open, 0=closed


def cmd_list():
    print("Available shades:")
    for key in sorted(DEVICES):
        d = DEVICES[key]
        print(f"  {key:15s}  {d['label']:15s}  ID:{d['aid']}  ({d['type']})")


def cmd_status(dev: dict):
    pct = read_position(dev)
    if pct is None:
        print(f"{dev['label']}: position unknown")
    else:
        print(f"{dev['label']}: {pct}% open")


def cmd_open(dev: dict):
    cgi(f"cmd=70&str1={dev['aid']}&str2=UP")
    print(f"{dev['label']}: opening")


def cmd_close(dev: dict):
    cgi(f"cmd=70&str1={dev['aid']}&str2=DOWN")
    print(f"{dev['label']}: closing")


def cmd_stop(dev: dict):
    cgi(f"cmd=70&str1={dev['aid']}&str2=STOP")
    print(f"{dev['label']}: stopped")


def cmd_set(dev: dict, target_c4: int):
    """Move shade to target position (C4 scale: 100=open, 0=closed)."""
    target_c4 = max(0, min(100, target_c4))
    target_troy = 100 - target_c4

    current_c4 = read_position(dev)
    if current_c4 is None:
        print(f"Cannot read position for {dev['label']}", file=sys.stderr)
        sys.exit(1)

    current_troy = 100 - current_c4
    diff = target_troy - current_troy

    if abs(diff) <= 2:
        print(f"{dev['label']}: already at {current_c4}% open")
        return

    # Move direction: positive diff = need more closed = DOWN
    direction = "DOWN" if diff > 0 else "UP"
    cgi(f"cmd=70&str1={dev['aid']}&str2={direction}")

    tolerance = 3
    for _ in range(60):
        time.sleep(1)
        now_c4 = read_position(dev)
        if now_c4 is None:
            continue
        now_troy = 100 - now_c4
        if abs(target_troy - now_troy) <= tolerance:
            cgi(f"cmd=70&str1={dev['aid']}&str2=STOP")
            print(f"{dev['label']}: set to {now_c4}% open (target: {target_c4}%)")
            return

    # Timeout
    cgi(f"cmd=70&str1={dev['aid']}&str2=STOP")
    final = read_position(dev)
    print(f"{dev['label']}: stopped at {final}% open (target was {target_c4}%)")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return

    action = args[0]

    if action == "list":
        cmd_list()
        return

    if len(args) < 2:
        print(f"Usage: troy.sh {action} <shade> [percent]", file=sys.stderr)
        sys.exit(1)

    dev = resolve(args[1])

    if action == "status":
        cmd_status(dev)
    elif action == "open":
        cmd_open(dev)
    elif action == "close":
        cmd_close(dev)
    elif action == "stop":
        cmd_stop(dev)
    elif action == "set":
        if len(args) < 3:
            print("Usage: troy.sh set <shade> <percent>", file=sys.stderr)
            sys.exit(1)
        cmd_set(dev, int(args[2]))
    else:
        print(f"Unknown action: {action}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
