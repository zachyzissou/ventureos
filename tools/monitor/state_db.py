"""
Monitor-Agent State Database Module
Phase Zero: Self-Healing Foundation

Handles all database operations using aiosqlite.
"""

import aiosqlite
import json
from typing import Optional, List, Dict, Any
from models import Issue, HealResult, HealthCheck, Metric


class StateDatabase:
    """Async SQLite database for Monitor-Agent state"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn: Optional[aiosqlite.Connection] = None
    
    async def connect(self):
        """Open database connection"""
        self.conn = await aiosqlite.connect(self.db_path)
        self.conn.row_factory = aiosqlite.Row
    
    async def close(self):
        """Close database connection"""
        if self.conn:
            await self.conn.close()
    
    # Issue operations
    
    async def record_issue(self, issue: Issue):
        """Record a new issue"""
        await self.conn.execute(
            """
            INSERT INTO issues (id, detected_at, severity, category, system, message, can_auto_fix, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                issue.id,
                issue.detected_at,
                issue.severity.value,
                issue.category.value,
                issue.system,
                issue.message,
                1 if issue.can_auto_fix else 0,
                json.dumps(issue.metadata),
            ),
        )
        await self.conn.commit()
    
    async def resolve_issue(self, issue_id: str):
        """Mark an issue as resolved"""
        import time
        await self.conn.execute(
            "UPDATE issues SET resolved_at = ? WHERE id = ?",
            (int(time.time()), issue_id),
        )
        await self.conn.commit()
    
    async def get_active_issues(self) -> List[Dict[str, Any]]:
        """Get all unresolved issues"""
        async with self.conn.execute(
            "SELECT * FROM issues WHERE resolved_at IS NULL ORDER BY detected_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    
    # Healing action operations
    
    async def record_healing_action(self, issue: Issue, heal_result: HealResult):
        """Record a healing action"""
        await self.conn.execute(
            """
            INSERT INTO healing_actions (issue_id, timestamp, action_name, success, message, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                issue.id,
                heal_result.timestamp,
                heal_result.action_taken,
                1 if heal_result.success else 0,
                heal_result.message,
                json.dumps(heal_result.metadata),
            ),
        )
        await self.conn.commit()
    
    # Health check operations
    
    async def record_health_check(self, health_check: HealthCheck):
        """Record a health check result"""
        await self.conn.execute(
            """
            INSERT INTO health_checks (timestamp, category, system, check_name, status, response_time_ms, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                health_check.timestamp,
                health_check.category.value,
                health_check.system,
                health_check.check_name,
                health_check.status.value,
                health_check.response_time_ms,
                json.dumps(health_check.metadata),
            ),
        )
        await self.conn.commit()
    
    async def get_recent_health_checks(self, system: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent health checks for a system"""
        async with self.conn.execute(
            "SELECT * FROM health_checks WHERE system = ? ORDER BY timestamp DESC LIMIT ?",
            (system, limit),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    
    # Metric operations
    
    async def record_metric(self, metric: Metric):
        """Record a performance metric"""
        await self.conn.execute(
            """
            INSERT INTO metrics (timestamp, metric_name, value, unit, metadata)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                metric.timestamp,
                metric.metric_name,
                metric.value,
                metric.unit,
                json.dumps(metric.metadata),
            ),
        )
        await self.conn.commit()
    
    # Alert operations
    
    async def record_alert(self, issue_id: str, severity: str, channel: str, delivered: bool):
        """Record an alert sent"""
        import time
        await self.conn.execute(
            """
            INSERT INTO alerts (issue_id, timestamp, severity, channel, delivered)
            VALUES (?, ?, ?, ?, ?)
            """,
            (issue_id, int(time.time()), severity, channel, 1 if delivered else 0),
        )
        await self.conn.commit()
    
    # Agent state operations
    
    async def update_agent_state(self, pid: int, status: str):
        """Update Monitor-Agent state"""
        import time
        await self.conn.execute(
            """
            INSERT OR REPLACE INTO agent_state (id, started_at, last_heartbeat, pid, status)
            VALUES (1, ?, ?, ?, ?)
            """,
            (int(time.time()), int(time.time()), pid, status),
        )
        await self.conn.commit()
    
    async def get_agent_state(self) -> Optional[Dict[str, Any]]:
        """Get Monitor-Agent state"""
        async with self.conn.execute("SELECT * FROM agent_state WHERE id = 1") as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None
