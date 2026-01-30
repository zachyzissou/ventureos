"""
Logging Configuration
Phase Zero: Quality Fix

Structured logging setup using structlog.
"""

import logging
import structlog
from pathlib import Path


def setup_logging(log_dir: Path = None, level: str = "INFO"):
    """Configure structured logging for Monitor-Agent"""
    
    if log_dir is None:
        log_dir = Path(__file__).parent / "logs"
    
    log_dir.mkdir(exist_ok=True)
    
    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, level.upper()),
        handlers=[
            logging.FileHandler(log_dir / "monitor-agent.log"),
            logging.StreamHandler(),
        ]
    )
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    return structlog.get_logger()


def get_logger(name: str = None):
    """Get a logger instance"""
    return structlog.get_logger(name)
