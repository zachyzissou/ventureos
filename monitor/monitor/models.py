"""
Monitor-Agent Data Models
Phase Zero: Self-Healing Foundation
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from enum import Enum
import uuid
import time
import json


class Severity(str, Enum):
    """Issue severity levels"""
    P0 = "P0"  # Critical - immediate alert (Discord + SMS)
    P1 = "P1"  # High - alert within 15 min (Discord)
    P2 = "P2"  # Medium - queue for next check-in (Discord queue)
    P3 = "P3"  # Low - daily digest


class Category(str, Enum):
    """System categories"""
    INFRASTRUCTURE = "infrastructure"
    DATA_INTEGRITY = "data_integrity"
    BUSINESS_UNITS = "business_units"
    SECURITY = "security"
    PERFORMANCE = "performance"


class Status(str, Enum):
    """Health check status"""
    OK = "ok"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class Issue:
    """Represents a detected issue"""
    severity: Severity
    category: Category
    system: str
    message: str
    can_auto_fix: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    detected_at: int = field(default_factory=lambda: int(time.time()))
    resolved_at: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage"""
        return {
            "id": self.id,
            "severity": self.severity.value,
            "category": self.category.value,
            "system": self.system,
            "message": self.message,
            "can_auto_fix": 1 if self.can_auto_fix else 0,
            "metadata": json.dumps(self.metadata),
            "detected_at": self.detected_at,
            "resolved_at": self.resolved_at,
        }


@dataclass
class HealResult:
    """Result of a self-healing action"""
    success: bool
    message: str
    action_taken: str
    escalate: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: int = field(default_factory=lambda: int(time.time()))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage"""
        return {
            "timestamp": self.timestamp,
            "action_name": self.action_taken,
            "success": 1 if self.success else 0,
            "message": self.message,
            "metadata": json.dumps(self.metadata),
        }


@dataclass
class HealthCheck:
    """Result of a health check"""
    category: Category
    system: str
    check_name: str
    status: Status
    response_time_ms: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: int = field(default_factory=lambda: int(time.time()))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage"""
        return {
            "timestamp": self.timestamp,
            "category": self.category.value,
            "system": self.system,
            "check_name": self.check_name,
            "status": self.status.value,
            "response_time_ms": self.response_time_ms,
            "metadata": json.dumps(self.metadata),
        }


@dataclass
class Metric:
    """Performance or business metric"""
    metric_name: str
    value: float
    unit: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: int = field(default_factory=lambda: int(time.time()))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage"""
        return {
            "timestamp": self.timestamp,
            "metric_name": self.metric_name,
            "value": self.value,
            "unit": self.unit,
            "metadata": json.dumps(self.metadata),
        }
