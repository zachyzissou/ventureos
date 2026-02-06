"""
Preferred import location for the content processor.

The main implementation currently lives at the repo root as `content_processor.py`.
We re-export it here so the refactored `src/*` modules don't need to import from
top-level scripts.
"""

from content_processor import StantonTimesContentProcessor

__all__ = ["StantonTimesContentProcessor"]

