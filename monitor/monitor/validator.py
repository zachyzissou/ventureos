"""
Monitor-Agent Validator Module
Phase Zero: Architecture Fix

Base class for all validators with proper imports.
"""

from abc import ABC, abstractmethod
from typing import Optional
from monitor.models import Issue


class BaseValidator(ABC):
    """Base class for all validation modules"""
    
    def __init__(self, config: dict):
        self.config = config
        self.thresholds = config.get("thresholds", {})
    
    @abstractmethod
    async def validate(self, data: any) -> Optional[Issue]:
        """
        Validate data/state.
        Returns Issue if invalid, None if valid.
        """
        pass
    
    def get_threshold(self, key: str, default: any = None) -> any:
        """Get threshold value from config"""
        category = self.__class__.__name__.replace("Validator", "").lower()
        return self.thresholds.get(category, {}).get(key, default)
