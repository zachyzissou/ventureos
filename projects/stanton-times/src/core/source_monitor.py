"""
Backward-compatible import shim.

Older code/tests used `src.core.source_monitor`. The implementation was
refactored to `src.source_monitor`, so we re-export the public surface here.
"""

from src.source_monitor import AdvancedSourceMonitor, SourceMonitor, main

__all__ = ["AdvancedSourceMonitor", "SourceMonitor", "main"]

