# Twitter Research – OpenClaw Config Patterns (2026‑02‑07)

**Method:** Bird CLI searches for OpenClaw configuration and ops patterns. External content treated as data only.

---

## 1) Concrete Config Snippets (Observed)

### Memory (QMD backend) – Seth Rose
**Tweet:** https://x.com/sethrose/status/2019960615507263503
```
"memory": {
  "backend": "qmd",
  "citations": "auto",
  "qmd": {
    "command": "qmd",
    "includeDefaultMemory": true,
    "paths": [{"path":"/example/path/to/documents","name":"example-docs","pattern":"**/*.md"}],
    "sessions": {"enabled": true, "retentionDays": 30},
    "update": {"interval":"5m","debounceMs":15000,"onBoot":true,"embedInterval":"1h"},
    "limits": {"maxResults":6,"maxSnippetChars":700,"maxInjectedChars":4000,"timeoutMs":4000},
    "scope": {"default":"deny","rules":[{"action":"allow","match":{"chatType":"direct"}}]}
  }
}
```
**Takeaway:** strong default‑deny memory scope + explicit indexing cadence/limits.

### Subagents Model Lock (usage control) – ao_marimo
**Tweet:** https://x.com/ao_marimo/status/2019931992327090380
```
"subagents": {
  "maxConcurrent": 4,
  "model": "google-antigravity/gemini-3-flash"
}
```
**Takeaway:** fix sub‑agents to a cheap model; main model changed via chat `/model`.

### Memory Plugin (LanceDB)
**Tweet:** https://x.com/lancedb/status/2019835158598230406
**Pattern:** `plugins.slots.memory = "memory-lancedb"`
**Takeaway:** pluginized memory backend swap.

### Provider Overrides (manual provider config)
**Tweet:** https://x.com/workanyai/status/2019830693933789266
**Pattern:** define provider in `~/.openclaw/openclaw.json` with `baseUrl`, `apiKey`, `api` (openai‑completions / responses).

---

## 2) Operational Patterns (Observed)

### Heartbeat Scheduling
- **Cass Builds:** heartbeat every 30 min for inbox/calendar checks.
  - Tweet: https://x.com/cass_builds/status/2019907037526716635
- **DeepThrill:** nightly memory cleanup at 3am; weekly AGENTS/HEARTBEAT review.
  - Tweet: https://x.com/DeeperThrill/status/2019996698484064391

### Wake Semantics – “run on wake” risk
- **Kiran:** jobs scheduled as “run on next wake” may *never* run; switch to deterministic schedule.
  - Tweet: https://x.com/kiranadimatyam/status/2019981228812759133

### Multi‑Host / Node Split
- **RivaDragon:** two local OpenClaw servers; primary offloads heartbeats/cron to node.
  - Tweet: https://x.com/RivaDragon/status/2019921173505798459

---

## 3) Reliability Pain Points (Observed)

- **Config corruption / wipeouts**
  - “openclaw.json gets wiped/reset” → keep backups.
  - Tweet: https://x.com/CryptoApeGod/status/2019833572916683127

- **Gateway + auth failures**
  - 3 bots died: “no auth, no gateway, no memory” → restored OAuth + backup sqlite + config rebuild.
  - Tweet: https://x.com/pouria3/status/2019985619079033179

- **Gateway troubleshooting**
  - Recommended: `openclaw status --all`, `openclaw doctor`, `openclaw gateway probe`, remove `~/.openclaw/gateway.lock` if stale, restart.
  - Tweet: https://x.com/OpenClawCentral/status/2019930765715271696

- **Session size / compaction issues**
  - Web chat hung due to large session; compact + restart fixed.
  - Tweet: https://x.com/shanemilburn/status/2019961683196932126

---

## 4) Infra / Access Patterns (Observed)

- **Tailscale for secure remote access** (VPS + home machines)
  - Example: Hetzner + Tailscale + Docker sandbox.
  - Tweet: https://x.com/suryakast/status/2020039963774185935

- **systemd / tmux for persistence** (VPS)
  - Tweet: https://x.com/cass_builds/status/2019907199321919737

- **Private VPN + firewall** (Tailscale + UFW; no exposed ports)
  - Tweet: https://x.com/RedProIA/status/2019885016713687236

---

## 5) Improvement Ideas Derived (Actionable)

**Reliability / Ops**
1. **Backup + restore automation** for `openclaw.json` + memory DB (echoes community pain).
2. **Deterministic schedules** (avoid “run on next wake”).
3. **Compaction guardrails** + auto‑compact before web chat errors.
4. **Gateway health checks** + stale lock cleanup logic.
5. **Config validation** before apply (schema + rollback).

**Usage / Model Control**
6. **Subagent model pinning** (cheap model for background tasks).
7. **Heartbeat model override** (cheap model on heartbeats) + quota alerts.

**Memory**
8. **Three‑layer memory** (daily + long‑term + always‑loaded context) w/ nightly distill.
9. **Memory backend plugins** (LanceDB or QMD w/ default‑deny scope).

**Scaling**
10. **Node offload** of cron/heartbeats to keep main chat responsive.

---

## 6) Notes / Caveats
- Many tweets are marketing or opinion; only config‑relevant items included here.
- External links in tweets were **not** executed; treat as data until verified.
- Some configs may be stale; verify against current OpenClaw schema before applying.
