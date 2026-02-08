"""
Monitor-Agent Alerter Module
Phase Zero Day 5: Alert delivery system

Base class for all alerting modules.
"""

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Dict, Set
from monitor.models import Issue, HealResult
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class BaseAlerter(ABC):
    """Base class for all alerting modules with deduplication"""
    
    def __init__(self, config: dict):
        self.config = config
        self.alerting_config = config.get("alerting", {})
        self.enabled = self.alerting_config.get("enabled", True)
        self.dedup_window = self.alerting_config.get("deduplication_window_seconds", 300)
        self.batch_interval = self.alerting_config.get("batch_interval_seconds", 900)
        
        # Thread-safe alert tracking
        self._recent_alerts: Dict[str, int] = {}  # alert_key -> timestamp
        self._pending_batch: Set[str] = set()  # P2/P3 alerts waiting to batch
        self._alert_lock = asyncio.Lock()
    
    @abstractmethod
    async def send_alert(self, issue: Issue, escalation: bool = False) -> bool:
        """
        Send an alert for the given issue.
        Returns True if alert was sent successfully.
        """
        pass
    
    @abstractmethod
    async def send_heal_result(self, issue: Issue, result: HealResult) -> bool:
        """
        Send notification about heal attempt result.
        Returns True if notification was sent successfully.
        """
        pass
    
    async def should_alert(self, issue: Issue) -> bool:
        """
        Check if we should send this alert (deduplication + enabled check).
        Thread-safe with async lock.
        """
        async with self._alert_lock:
            if not self.enabled:
                logger.debug("Alerting disabled globally")
                return False
            
            # Create dedup key
            alert_key = f"{issue.category.value}:{issue.system}:{issue.message[:100]}"
            
            # Check if we've alerted recently
            last_alert = self._recent_alerts.get(alert_key, 0)
            time_since_last = time.time() - last_alert
            
            if time_since_last < self.dedup_window:
                logger.debug("Alert deduplicated",
                           alert_key=alert_key,
                           time_since_last=int(time_since_last))
                return False
            
            return True
    
    async def record_alert(self, issue: Issue):
        """
        Record that an alert was sent (for deduplication).
        Thread-safe with async lock.
        """
        async with self._alert_lock:
            alert_key = f"{issue.category.value}:{issue.system}:{issue.message[:100]}"
            self._recent_alerts[alert_key] = int(time.time())
            
            logger.debug("Alert recorded",
                        alert_key=alert_key,
                        issue_id=issue.id)
    
    async def add_to_batch(self, issue: Issue):
        """Add P2/P3 alert to batch queue"""
        async with self._alert_lock:
            alert_key = f"{issue.id}:{issue.severity.value}"
            self._pending_batch.add(alert_key)
            logger.debug("Alert added to batch", alert_key=alert_key)
    
    async def get_batched_alerts(self) -> Set[str]:
        """Get and clear pending batch alerts"""
        async with self._alert_lock:
            alerts = self._pending_batch.copy()
            self._pending_batch.clear()
            return alerts
    
    async def cleanup_old_alerts(self, max_age_seconds: int = 3600):
        """Clean up old alert records to prevent memory bloat"""
        async with self._alert_lock:
            current_time = time.time()
            to_remove = [
                key for key, timestamp in self._recent_alerts.items()
                if current_time - timestamp > max_age_seconds
            ]
            
            for key in to_remove:
                del self._recent_alerts[key]
            
            if to_remove:
                logger.debug("Cleaned up old alerts", count=len(to_remove))
