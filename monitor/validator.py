"""
Monitor-Agent Validator Module
Phase Zero: Self-Healing Foundation

Base class for all validators. Specific validators inherit from this.
"""

from abc import ABC, abstractmethod
from typing import Optional
from models import Issue


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


class SchemaValidator(BaseValidator):
    """Validates data against JSON schemas"""
    
    def __init__(self, config: dict, schema: dict):
        super().__init__(config)
        self.schema = schema
    
    async def validate(self, data: dict) -> Optional[Issue]:
        """Validate JSON data against schema"""
        # Implementation in Day 3
        pass


class IntegrityValidator(BaseValidator):
    """Validates data integrity (corruption, completeness)"""
    
    async def validate(self, file_path: str) -> Optional[Issue]:
        """Validate file integrity"""
        # Implementation in Day 3
        pass
