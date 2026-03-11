# Gateway Postures (Supported)

This doc defines the two **supported, tested** gateway postures. Pick one and keep the config + firewall consistent.

## Posture A — Safe Default (Loopback + Remote Access)
**Use when:** you want maximum safety and are ok with remote access via SSH tunnel or Tailscale Serve.

**Config:**
```json5
{
  gateway: {
    bind: "loopback",
    tailscale: { mode: "serve" }, // or "off" if using SSH tunnel
    remote: { url: "ws://127.0.0.1:18789" }
  }
}
```

**Notes:**
- Tailscale Serve **requires** `bind=loopback`.
- Use `wss://` only when there is real TLS termination in front of the gateway.
- This posture does **not** expose 18789 on LAN.

---

## Posture B — LAN‑First (Firewall‑Hardened)
**Use when:** you need LAN nodes to connect directly and can enforce a strict firewall allowlist.

**Config:**
```json5
{
  gateway: {
    bind: "lan",
    tailscale: { mode: "off" },
    remote: { url: "ws://openclaw.local:18789" }
  }
}
```

**Firewall (pf) example — interface‑scoped (safe for loopback):**
```pf
pass in quick on en0 inet proto tcp from 192.168.225.0/24 to (en0) port 18789
pass in quick on utun6 inet proto tcp from 100.64.0.0/10 to any port 18789
pass in quick on utun6 inet6 proto tcp from fd7a:115c:a1e0::/48 to any port 18789

# Block only on LAN/tailnet interfaces (NOT loopback)
block in quick on en0 inet proto tcp to port 18789
block in quick on utun6 inet proto tcp to port 18789
block in quick on utun6 inet6 proto tcp to port 18789
```

**Do NOT:**
```pf
# ❌ This will block loopback and break local access
block in quick proto tcp to port 18789
```

---

## TLS Rules (ws vs wss)
- Use **ws://** when the gateway port is **not** TLS‑terminated.
- Use **wss://** only when a reverse proxy or Tailscale Serve is providing TLS.

---

## One Gateway Per Host
Recommended for most setups. Multiple gateways require isolated config/state and dedicated ports.
