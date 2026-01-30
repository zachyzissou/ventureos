"""
Monitor-Agent State Database Module
Phase Zero: Architecture Fix

Handles all database operations with proper connection lifecycle.
"""

import aiosqlite
import json
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from monitor.models import Issue, HealResult, HealthCheck, Metric
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class DatabaseError(Exception):
    """Custom exception for database errors"""
    pass


class StateDatabase:
    """
    Async SQLite database for Monitor-Agent state.
    
    Use as async context manager:
        async with StateDatabase(db_path) as db:
            await db.record_issue(issue)
    """
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn: Optional[aiosqlite.Connection] = None
    
    async def __aenter__(self):
        """Async context manager entry - opens connection"""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - closes connection"""
        await self.close()
    
    async def connect(self):
        """Open database connection"""
        if self.conn:
            logger.warning("Database already connected", db_path=self.db_path)
            return
        
        try:
            self.conn = await aiosqlite.connect(self.db_path)
            self.conn.row_factory = aiosqlite.Row
            logger.info("Database connected", db_path=self.db_path)
        except Exception as e:
            logger.error("Failed to connect to database", error=str(e), db_path=self.db_path)
            raise DatabaseError(f"Connection failed: {e}") from e
    
    async def close(self):
        """Close database connection"""
        if self.conn:
            try:
                await self.conn.close()
                logger.info("Database closed", db_path=self.db_path)
            except Exception as e:
                logger.error("Failed to close database", error=str(e))
            finally:
                self.conn = None
    
    def _ensure_connected(self):
        """Verify connection exists before operations"""
        if not self.conn:
            raise DatabaseError("Database not connected. Use 'async with StateDatabase()' or call connect() first.")
    
    # Issue operations
    
    async def record_issue(self, issue: Issue):
        """Record a new issue"""
        self._ensure_connected()
        
        try:
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
            logger.debug("Issue recorded", issue_id=issue.id, severity=issue.severity.value)
        except aiosqlite.Error as e:
            logger.error("Failed to record issue", error=str(e), issue_id=issue.id)
            raise DatabaseError(f"Failed to record issue: {e}") from e
    
    async def resolve_issue(self, issue_id: str):
        """Mark an issue as resolved"""
        self._ensure_connected()
        
        import time
        try:
            await self.conn.execute(
                "UPDATE issues SET resolved_at = ? WHERE id = ?",
                (int(time.time()), issue_id),
            )
            await self.conn.commit()
            logger.debug("Issue resolved", issue_id=issue_id)
        except aiosqlite.Error as e:
            logger.error("Failed to resolve issue", error=str(e), issue_id=issue_id)
            raise DatabaseError(f"Failed to resolve issue: {e}") from e
    
    async def get_active_issues(self) -> List[Dict[str, Any]]:
        """Get all unresolved issues"""
        self._ensure_connected()
        
        try:
            async with self.conn.execute(
                "SELECT * FROM issues WHERE resolved_at IS NULL ORDER BY detected_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except aiosqlite.Error as e:
            logger.error("Failed to get active issues", error=str(e))
            raise DatabaseError(f"Failed to get active issues: {e}") from e
    
    # Healing action operations
    
    async def record_healing_action(self, issue: Issue, heal_result: HealResult):
        """Record a healing action"""
        self._ensure_connected()
        
        try:
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
            logger.debug("Healing action recorded", 
                        issue_id=issue.id, 
                        action=heal_result.action_taken,
                        success=heal_result.success)
        except aiosqlite.Error as e:
            logger.error("Failed to record healing action", 
                        error=str(e), 
                        issue_id=issue.id,
                        action=heal_result.action_taken)
            raise DatabaseError(f"Failed to record healing action: {e}") from e
    
    # Health check operations
    
    async def record_health_check(self, health_check: HealthCheck):
        """Record a health check result"""
        self._ensure_connected()
        
        try:
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
            logger.debug("Health check recorded", 
                        system=health_check.system,
                        status=health_check.status.value)
        except aiosqlite.Error as e:
            logger.error("Failed to record health check",
                        error=str(e),
                        system=health_check.system)
            raise DatabaseError(f"Failed to record health check: {e}") from e
    
    async def get_recent_health_checks(self, system: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent health checks for a system"""
        self._ensure_connected()
        
        try:
            async with self.conn.execute(
                "SELECT * FROM health_checks WHERE system = ? ORDER BY timestamp DESC LIMIT ?",
                (system, limit),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except aiosqlite.Error as e:
            logger.error("Failed to get health checks",
                        error=str(e),
                        system=system)
            raise DatabaseError(f"Failed to get health checks: {e}") from e
    
    # Metric operations
    
    async def record_metric(self, metric: Metric):
        """Record a performance metric"""
        self._ensure_connected()
        
        try:
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
            logger.debug("Metric recorded",
                        metric_name=metric.metric_name,
                        value=metric.value)
        except aiosqlite.Error as e:
            logger.error("Failed to record metric",
                        error=str(e),
                        metric_name=metric.metric_name)
            raise DatabaseError(f"Failed to record metric: {e}") from e
    
    # Alert operations
    
    async def record_alert(self, issue_id: str, severity: str, channel: str, delivered: bool):
        """Record an alert sent"""
        self._ensure_connected()
        
        import time
        try:
            await self.conn.execute(
                """
                INSERT INTO alerts (issue_id, timestamp, severity, channel, delivered)
                VALUES (?, ?, ?, ?, ?)
                """,
                (issue_id, int(time.time()), severity, channel, 1 if delivered else 0),
            )
            await self.conn.commit()
            logger.debug("Alert recorded",
                        issue_id=issue_id,
                        channel=channel,
                        delivered=delivered)
        except aiosqlite.Error as e:
            logger.error("Failed to record alert",
                        error=str(e),
                        issue_id=issue_id)
            raise DatabaseError(f"Failed to record alert: {e}") from e
    
    # Agent state operations
    
    async def update_agent_state(self, pid: int, status: str):
        """Update Monitor-Agent state"""
        self._ensure_connected()
        
        import time
        try:
            await self.conn.execute(
                """
                INSERT OR REPLACE INTO agent_state (id, started_at, last_heartbeat, pid, status)
                VALUES (1, ?, ?, ?, ?)
                """,
                (int(time.time()), int(time.time()), pid, status),
            )
            await self.conn.commit()
            logger.debug("Agent state updated", pid=pid, status=status)
        except aiosqlite.Error as e:
            logger.error("Failed to update agent state",
                        error=str(e),
                        pid=pid)
            raise DatabaseError(f"Failed to update agent state: {e}") from e
    
    async def get_agent_state(self) -> Optional[Dict[str, Any]]:
        """Get Monitor-Agent state"""
        self._ensure_connected()
        
        try:
            async with self.conn.execute("SELECT * FROM agent_state WHERE id = 1") as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None
        except aiosqlite.Error as e:
            logger.error("Failed to get agent state", error=str(e))
            raise DatabaseError(f"Failed to get agent state: {e}") from e
