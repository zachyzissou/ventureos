-- Monitor-Agent Database Schema
-- Phase Zero: Self-Healing Foundation
-- Created: 2026-01-30

-- System health history
CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    category TEXT NOT NULL,  -- infrastructure, data_integrity, business_units
    system TEXT NOT NULL,     -- gateway, cron, api, disk, memory, etc.
    check_name TEXT NOT NULL,
    status TEXT NOT NULL,     -- ok, warning, error
    response_time_ms INTEGER,
    metadata TEXT,            -- JSON blob
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Issues detected
CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,      -- UUID
    detected_at INTEGER NOT NULL,
    resolved_at INTEGER,
    severity TEXT NOT NULL,   -- P0, P1, P2, P3
    category TEXT NOT NULL,
    system TEXT NOT NULL,
    message TEXT NOT NULL,
    can_auto_fix INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,            -- JSON blob
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Healing actions taken
CREATE TABLE IF NOT EXISTS healing_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    action_name TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    metadata TEXT,            -- JSON blob
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id)
);

-- Alerts sent
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    severity TEXT NOT NULL,
    channel TEXT NOT NULL,   -- discord, sms, digest
    delivered INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,           -- JSON blob
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id)
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    metadata TEXT,           -- JSON blob
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Monitor-Agent state (single row)
CREATE TABLE IF NOT EXISTS agent_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    started_at INTEGER NOT NULL,
    last_heartbeat INTEGER NOT NULL,
    pid INTEGER,
    status TEXT NOT NULL,    -- running, stopped, error
    metadata TEXT,           -- JSON blob
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp);
CREATE INDEX IF NOT EXISTS idx_health_checks_system ON health_checks(system);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks(status);

CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_resolved ON issues(resolved_at);
CREATE INDEX IF NOT EXISTS idx_issues_detected ON issues(detected_at);

CREATE INDEX IF NOT EXISTS idx_healing_actions_issue ON healing_actions(issue_id);
CREATE INDEX IF NOT EXISTS idx_healing_actions_timestamp ON healing_actions(timestamp);

CREATE INDEX IF NOT EXISTS idx_alerts_issue ON alerts(issue_id);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);

CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
