#!/usr/bin/env python3
"""task-queue.py

Workspace copy of openclaw-upgrade/scripts/task-queue.py
See that repo path for source-of-truth.
"""

from pathlib import Path
import runpy

SRC = Path.home() / "clawd/projects/openclaw-upgrade/scripts/task-queue.py"
runpy.run_path(str(SRC), run_name="__main__")
