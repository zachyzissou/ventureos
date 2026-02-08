"""
Monitor-Agent Healer Module
Phase Zero: Architecture Fix + Safety Features

Base class for all healers with concurrency safety and dry-run mode.
"""

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Dict
from monitor.models import Issue, HealResult
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class BaseHealer(ABC):
    """Base class for all healing modules with concurrency safety"""
    
    def __init__(self, config: dict):
        self.config = config
        self.healing_config = config.get("healing", {})
        self.enabled = self.healing_config.get("enabled", True)
        self.dry_run = self.healing_config.get("dry_run", False)  # SAFETY: dry-run mode
        self.max_attempts = self.healing_config.get("max_attempts", 3)
        self.cooldown_seconds = self.healing_config.get("cooldown_seconds", 300)
        self.manual_approval_actions = set(
            self.healing_config.get("manual_approval_required", [])
        )
        
        # Thread-safe state management
        self._last_heal_times: Dict[str, int] = {}
        self._heal_attempts: Dict[str, int] = {}  # Track attempts per issue
        self._heal_lock = asyncio.Lock()  # Prevent race conditions
        
        if self.dry_run:
            logger.warning("healer_dry_run_enabled",
                         healer=self.__class__.__name__,
                         message="Dry-run mode: will LOG actions but NOT execute")
    
    @abstractmethod
    async def heal(self, issue: Issue) -> HealResult:
        """
        Attempt to heal the issue.
        Returns HealResult indicating success/failure.
        """
        pass
    
    async def can_heal(self, issue: Issue, action_name: str) -> bool:
        """
        Check if action is enabled and off cooldown.
        Thread-safe with async lock.
        """
        async with self._heal_lock:
            if not self.enabled:
                logger.debug("Healing disabled globally", action=action_name)
                return False
            
            # Check cooldown
            last_heal = self._last_heal_times.get(action_name, 0)
            time_since_last = time.time() - last_heal
            
            if time_since_last < self.cooldown_seconds:
                logger.debug("Action on cooldown",
                           action=action_name,
                           remaining_seconds=int(self.cooldown_seconds - time_since_last))
                return False
            
            # Check max attempts for this issue
            attempts = self._heal_attempts.get(issue.id, 0)
            if attempts >= self.max_attempts:
                logger.warning("Max heal attempts reached",
                             issue_id=issue.id,
                             action=action_name,
                             attempts=attempts)
                return False
            
            # Check action-specific config
            actions = self.healing_config.get("actions", {})
            action_config = actions.get(action_name, {})
            
            if not action_config.get("enabled", True):
                logger.debug("Action disabled in config", action=action_name)
                return False
            
            return True
    
    async def requires_approval(self, action: str) -> bool:
        """Check if this action requires manual approval"""
        return action in self.manual_approval_actions
    
    async def request_approval(self, issue: Issue, action: str) -> bool:
        """
        Request manual approval for critical action.
        
        TODO: Implement Discord notification with Y/N buttons.
        For now:
        - In dry-run: auto-approve (won't execute anyway)
        - In production: auto-deny until Discord approval implemented
        """
        if self.dry_run:
            logger.warning(
                "approval_bypassed_dry_run",
                action=action,
                issue_id=issue.id,
                message="Dry-run mode: would request approval but bypassing"
            )
            return True
        
        # TODO: Send Discord message with Y/N buttons, wait for response
        logger.error(
            "approval_required_not_implemented",
            action=action,
            issue_id=issue.id,
            message="Manual approval required but Discord approval not yet implemented - DENYING"
        )
        return False
    
    async def record_heal_attempt(self, issue: Issue, action_name: str):
        """
        Record that a heal was attempted (for cooldown and max attempts).
        Thread-safe with async lock.
        """
        async with self._heal_lock:
            self._last_heal_times[action_name] = int(time.time())
            self._heal_attempts[issue.id] = self._heal_attempts.get(issue.id, 0) + 1
            
            logger.debug("Heal attempt recorded",
                        issue_id=issue.id,
                        action=action_name,
                        attempt_count=self._heal_attempts[issue.id])
    
    async def clear_heal_attempts(self, issue: Issue):
        """Clear heal attempts for a successfully resolved issue"""
        async with self._heal_lock:
            if issue.id in self._heal_attempts:
                del self._heal_attempts[issue.id]
                logger.debug("Heal attempts cleared", issue_id=issue.id)
    
    async def verify_fix(self, issue: Issue) -> bool:
        """
        Verify that the fix worked.
        Override in specific healers to add verification logic.
        """
        return True


class InfrastructureHealer(BaseHealer):
    """Base class for infrastructure-related healers"""
    pass


class DataIntegrityHealer(BaseHealer):
    """Base class for data integrity healers"""
    pass


class BusinessUnitHealer(BaseHealer):
    """Base class for business unit healers"""
    pass
