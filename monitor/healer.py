"""
Monitor-Agent Healer Module
Phase Zero: Self-Healing Foundation

Base class for all healers. Specific healers inherit from this.
"""

from abc import ABC, abstractmethod
from typing import Dict
from models import Issue, HealResult
import time


class BaseHealer(ABC):
    """Base class for all healing modules"""
    
    def __init__(self, config: dict):
        self.config = config
        self.healing_config = config.get("healing", {})
        self.enabled = self.healing_config.get("enabled", True)
        self.max_attempts = self.healing_config.get("max_attempts", 3)
        self.cooldown_seconds = self.healing_config.get("cooldown_seconds", 300)
        self._last_heal_times: Dict[str, int] = {}
    
    @abstractmethod
    async def heal(self, issue: Issue) -> HealResult:
        """
        Attempt to heal the issue.
        Returns HealResult indicating success/failure.
        """
        pass
    
    def can_heal(self, action_name: str) -> bool:
        """Check if action is enabled and off cooldown"""
        if not self.enabled:
            return False
        
        # Check cooldown
        last_heal = self._last_heal_times.get(action_name, 0)
        if time.time() - last_heal < self.cooldown_seconds:
            return False
        
        # Check action-specific config
        actions = self.healing_config.get("actions", {})
        action_config = actions.get(action_name, {})
        return action_config.get("enabled", True)
    
    def record_heal_attempt(self, action_name: str):
        """Record that a heal was attempted (for cooldown)"""
        self._last_heal_times[action_name] = int(time.time())
    
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
