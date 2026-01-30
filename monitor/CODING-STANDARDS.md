# Monitor-Agent Coding Standards

**Created:** 2026-01-30  
**Purpose:** Prevent structure divergence and maintain code quality

---

## Directory Structure (MANDATORY)

**ALL code must live in `monitor/monitor/`:**

```
monitor/
├── monitor/          ← ALL CODE HERE
│   ├── detectors/    ← Detection modules
│   ├── validators/   ← Validation modules
│   ├── healers/      ← Self-healing modules
│   ├── alerters/     ← Alert delivery modules
│   ├── models.py     ← Data models
│   ├── state_db.py   ← Database layer
│   ├── detector.py   ← Base detector class
│   ├── validator.py  ← Base validator class
│   ├── healer.py     ← Base healer class
│   ├── alerter.py    ← Base alerter class
│   └── ...
├── test_*.py         ← Tests at top level
├── validate_structure.py  ← Run before commit
└── venv/             ← Python virtual environment
```

**❌ FORBIDDEN:**
- Code in `monitor/detectors/` (top level)
- Code in `monitor/validators/` (top level)
- Anywhere outside `monitor/monitor/`

---

## Import Standards (MANDATORY)

**✅ CORRECT:**
```python
from monitor.models import Issue, HealResult, Severity
from monitor.detector import BaseDetector
from monitor.validator import BaseValidator
from monitor.healer import BaseHealer
from monitor.logging_config import get_logger
```

**❌ FORBIDDEN:**
```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))  # NEVER DO THIS
from detector import BaseDetector  # WRONG
from models import Issue  # WRONG
```

---

## Before Every Commit

**Run validation:**
```bash
cd monitor
source venv/bin/activate
python validate_structure.py
```

**This checks:**
1. ✅ All code in correct location (`monitor/monitor/`)
2. ✅ No sys.path hacks
3. ✅ No orphaned directories
4. ✅ Proper imports (`from monitor.X import`)

**If validation fails:** FIX IT before committing.

---

## Why This Matters

**Lesson learned:** 2026-01-30

**What happened:**
- Days 1-3: Built code in wrong location with sys.path hacks
- Days 4-5: Built code in correct location with proper imports
- Result: Two incompatible structures that would break Day 6

**Root cause:**
- Speed without validation
- "Architecture fix" that didn't actually move files
- Assumed completion without verification

**Prevention:**
- Run `validate_structure.py` before every commit
- Never use `sys.path.insert()`
- Always import from `monitor.X`
- Verify imports work after changes

---

## Code Review Checklist

Before marking work "complete":

1. [ ] All files in `monitor/monitor/` (correct location)
2. [ ] No `sys.path` hacks anywhere
3. [ ] All imports use `from monitor.X import`
4. [ ] `validate_structure.py` passes
5. [ ] All tests pass
6. [ ] Can import from `monitor.detectors`, `monitor.validators`, etc.
7. [ ] Integration test works

**Don't trust commit messages. Verify the actual code.**

---

## Module Template

**When creating new detector/validator/healer/alerter:**

```python
"""
[Module Name]
Phase Zero Day X: [Component Type]

[Description of what this module does]
"""

# Standard library imports
import asyncio
from typing import Optional
from pathlib import Path  # If needed

# Monitor imports (ALWAYS use monitor. prefix)
from monitor.detector import BaseDetector  # or BaseValidator, BaseHealer, etc.
from monitor.models import Issue, Severity, Category
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class MyDetector(BaseDetector):
    """Docstring"""
    
    def __init__(self, config: dict):
        super().__init__(config)
    
    async def detect(self) -> Optional[Issue]:
        """Implementation"""
        pass
```

**Save in:** `monitor/monitor/detectors/my_detector.py`

**Add to __init__.py:**
```python
from monitor.detectors.my_detector import MyDetector

__all__ = [..., "MyDetector"]
```

---

## Testing Standard

**Test must import from package:**
```python
from monitor.detectors import MyDetector  # ✅ CORRECT
from monitor.validators import MyValidator  # ✅ CORRECT

# NOT:
sys.path.insert(0, ...)  # ❌ FORBIDDEN
from detectors.my_detector import MyDetector  # ❌ WRONG
```

**Test must pass:**
```bash
cd monitor
source venv/bin/activate
python test_my_module.py
```

---

## Enforcement

**Automated:**
- `validate_structure.py` catches violations
- Run before every commit
- CI/CD can run this too

**Manual:**
- Code review checks structure
- Don't accept PRs with wrong structure
- Fix immediately if found

---

**This happened once. Never again.** ✅
