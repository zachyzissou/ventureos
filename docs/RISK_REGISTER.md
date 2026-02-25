# Risk Register

| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| Backup failure (disk full) | Medium | High | Monitor disk space; verify weekly | Ops |
| Cron jobs not firing (wake‑only) | Medium | High | Use deterministic schedules | Ops |
| False‑positive alerts | Medium | Medium | Severity thresholds + log review | Ops |
| Quota usage spike | Medium | High | Quota alerts at 50/80/90% | Ops |
| Log growth / disk bloat | Medium | Medium | Retention policy + rotation | Ops |
| Auth token expiration | High | Medium | Monitor auth errors + notify | Ops |
| Config corruption | Low | High | Backups + validation | Ops |
| Alert channel outage | Low | Medium | Secondary channel fallback (future) | Ops |
