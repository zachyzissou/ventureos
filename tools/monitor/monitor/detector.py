"""
Monitor-Agent Detector Module
Phase Zero: Architecture Fix

Base class for all detectors with proper imports.
"""

from abc import ABC, abstractmethod
from typing import Optional
from monitor.models import Issue, HealthCheck


class BaseDetector(ABC):
    """Base class for all detection modules"""
    
    def __init__(self, config: dict):
        self.config = config
        self.thresholds = config.get("thresholds", {})
        self.frequencies = config.get("check_frequencies", {})
    
    @abstractmethod
    async def check(self) -> Optional[Issue]:
        """
        Run detection check.
        Returns Issue if problem found, None if everything OK.
        """
        pass
    
    @abstractmethod
    async def health_check(self) -> HealthCheck:
        """
        Run health check and return status.
        Always returns HealthCheck (even if status is OK).
        """
        pass
    
    def get_threshold(self, key: str, default: any = None) -> any:
        """Get threshold value from config"""
        category = self.__class__.__name__.replace("Detector", "").lower()
        return self.thresholds.get(category, {}).get(key, default)
    
    def get_frequency(self, key: str, default: int = 60) -> int:
        """Get check frequency from config"""
        return self.frequencies.get(key, default)


class InfrastructureDetector(BaseDetector):
    """Base class for infrastructure-related detectors"""
    pass


class DataIntegrityDetector(BaseDetector):
    """Base class for data integrity detectors"""
    pass


class BusinessUnitDetector(BaseDetector):
    """Base class for business unit detectors"""
    pass
