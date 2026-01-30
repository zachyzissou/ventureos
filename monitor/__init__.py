"""
Monitor-Agent Package
Phase Zero: Self-Healing Foundation

Proper package structure with logging initialization.
"""

from .logging_config import setup_logging, get_logger
from .models import Issue, HealResult, HealthCheck, Metric, Severity, Category, Status

__version__ = "0.1.0"

# Initialize logging on import
logger = setup_logging()

__all__ = [
    "Issue",
    "HealResult", 
    "HealthCheck",
    "Metric",
    "Severity",
    "Category",
    "Status",
    "get_logger",
]
