"""
Monitor-Agent Package
Phase Zero: Architecture Fix

Proper package structure with all components properly exported.
"""

from monitor.logging_config import setup_logging, get_logger
from monitor.models import Issue, HealResult, HealthCheck, Metric, Severity, Category, Status
from monitor.state_db import StateDatabase, DatabaseError
from monitor.http_client import HTTPClientManager

__version__ = "0.1.0"

# Initialize logging on import
logger = setup_logging()

__all__ = [
    # Models
    "Issue",
    "HealResult",
    "HealthCheck",
    "Metric",
    "Severity",
    "Category",
    "Status",
    # Database
    "StateDatabase",
    "DatabaseError",
    # HTTP
    "HTTPClientManager",
    # Logging
    "get_logger",
]
