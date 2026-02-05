import pytest
from src.core.source_monitor import SourceMonitor

def test_source_monitor_initialization():
    monitor = SourceMonitor()
    assert monitor is not None

def test_fetch_sources():
    monitor = SourceMonitor()
    sources = monitor.fetch_sources()
    assert isinstance(sources, list)
    assert len(sources) > 0