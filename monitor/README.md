# Monitor-Agent

**Phase Zero: Self-Healing Foundation**  
**Status:** 🔄 In Development (Day 1 Complete)

## What is Monitor-Agent?

A self-healing validation system that continuously monitors all Echo systems (infrastructure, data integrity, business units), automatically detects issues, attempts self-healing, and escalates only when necessary.

**Goal:** 99.9% uptime with 95%+ auto-healing rate and <1 manual intervention per week.

## Architecture

```
Monitor-Agent (Python Daemon)
├── Detector Module (find issues)
├── Validator Module (verify state)
├── Healer Module (auto-fix)
├── Alerter Module (escalate if needed)
└── State DB (SQLite for tracking)
```

## Project Structure

```
monitor/
├── config/
│   └── config.yaml         # Configuration (thresholds, frequencies, paths)
├── data/
│   └── monitor.db          # SQLite database (state, history, metrics)
├── logs/                   # Log files
├── scripts/                # Health check scripts (bash)
├── detectors/              # Detection modules (Python)
├── validators/             # Validation modules (Python)
├── healers/                # Self-healing modules (Python)
├── models.py               # Data models (Issue, HealResult, HealthCheck, Metric)
├── detector.py             # Base detector class
├── validator.py            # Base validator class
├── healer.py               # Base healer class
├── state_db.py             # Database operations (aiosqlite)
├── requirements.txt        # Python dependencies
├── schema.sql              # Database schema
└── README.md               # This file
```

## Day 1 Progress ✅

**Completed:**
- [x] Directory structure created
- [x] Python virtual environment set up
- [x] Dependencies installed (aiosqlite, httpx, pyyaml, discord-webhook, etc.)
- [x] Database schema defined (6 tables with indexes)
- [x] Database initialized (monitor.db)
- [x] Data models created (Issue, HealResult, HealthCheck, Metric)
- [x] Base classes defined (BaseDetector, BaseValidator, BaseHealer)
- [x] State database module (StateDatabase with async operations)
- [x] Configuration system (config.yaml with thresholds, frequencies)

**Acceptance Criteria:**
- ✅ Can import all base classes
- ✅ Can insert/query test data in monitor.db
- ✅ Config loads successfully

## Next Steps (Day 2)

**Goal:** Implement core detectors

- [ ] Gateway health detector (`check_gateway_health()`)
- [ ] Cron job detector (`check_cron_job()` for each job)
- [ ] API health detector (`check_api_health()` for Anthropic, Discord, Twitter)
- [ ] Disk space detector (`check_disk_space()`)
- [ ] Unit tests for each detector

## Running Monitor-Agent

**Not yet operational** - Day 2-7 implementation required.

Once complete, run with:
```bash
cd /Users/zachgonser/clawd/monitor
source venv/bin/activate
python monitor_agent.py
```

## Configuration

Edit `config/config.yaml` to adjust:
- Check frequencies (how often to run each check)
- Thresholds (when to alert/heal)
- Alert routing (Discord webhook, SMS, digest)
- Self-healing settings (enabled actions, cooldowns, max attempts)

## Database

SQLite database at `data/monitor.db` stores:
- **health_checks:** History of all health checks
- **issues:** Detected issues (resolved and active)
- **healing_actions:** Self-healing attempts
- **alerts:** Alerts sent
- **metrics:** Performance metrics
- **agent_state:** Monitor-Agent status (PID, uptime, heartbeat)

Query directly:
```bash
sqlite3 data/monitor.db "SELECT * FROM health_checks ORDER BY timestamp DESC LIMIT 10"
```

## Documentation

- **PHASE-ZERO-EXECUTION.md:** Complete 2-week execution plan
- **VALIDATION-SELF-HEALING-ARCHITECTURE.md:** Full architecture design
- **validation/infrastructure-methodology.md:** Infrastructure validation details
- **validation/data-integrity-methodology.md:** Data integrity validation details
- **validation/business-units-methodology.md:** Business unit validation details

---

**Created:** 2026-01-30  
**Progress:** Day 1 of 14 complete (7% done)
