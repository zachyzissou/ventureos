"""
Memory System Validator
Phase Zero Day 3: Data Validators

Validates daily memory files exist and are properly formatted.
"""

import time
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from validator import BaseValidator
from models import Issue, Severity, Category


class MemoryValidator(BaseValidator):
    """Validates memory system integrity"""
    
    async def validate(self, data: any = None) -> Optional[Issue]:
        """Validate memory system (daily logs, format, completeness)"""
        
        workspace = Path(self.config.get("paths", {}).get("workspace", "/Users/zachgonser/clawd"))
        memory_dir = workspace / "memory"
        
        # Check if memory directory exists
        if not memory_dir.exists():
            return Issue(
                severity=Severity.P1,
                category=Category.DATA_INTEGRITY,
                system="memory",
                message=f"Memory directory does not exist: {memory_dir}",
                can_auto_fix=True,
                metadata={"path": str(memory_dir), "action": "create_directory"}
            )
        
        # Check if today's memory file exists
        today = datetime.now().strftime("%Y-%m-%d")
        today_file = memory_dir / f"{today}.md"
        
        max_age_hours = self.get_threshold("max_file_age_hours", 2)
        
        if not today_file.exists():
            # Check how long it's been since midnight
            now = datetime.now()
            hours_since_midnight = now.hour + (now.minute / 60.0)
            
            if hours_since_midnight > max_age_hours:
                return Issue(
                    severity=Severity.P3,
                    category=Category.DATA_INTEGRITY,
                    system="memory",
                    message=f"Today's memory file missing: {today_file.name}",
                    can_auto_fix=True,
                    metadata={
                        "file": str(today_file),
                        "date": today,
                        "hours_since_midnight": hours_since_midnight,
                        "action": "create_from_template"
                    }
                )
        
        # Validate file format (basic checks)
        if today_file.exists():
            try:
                content = today_file.read_text()
                
                # Check if file has expected header
                if not content.startswith(f"# {today}"):
                    return Issue(
                        severity=Severity.P2,
                        category=Category.DATA_INTEGRITY,
                        system="memory",
                        message=f"Memory file missing expected header: {today_file.name}",
                        can_auto_fix=False,
                        metadata={
                            "file": str(today_file),
                            "expected_header": f"# {today}",
                            "actual_start": content[:50] if content else "(empty)"
                        }
                    )
                
                # Check file size (warn if too large)
                size_bytes = today_file.stat().st_size
                size_kb = size_bytes / 1024
                
                if size_kb > 500:  # Warn if over 500KB
                    return Issue(
                        severity=Severity.P3,
                        category=Category.DATA_INTEGRITY,
                        system="memory",
                        message=f"Memory file is very large: {size_kb:.1f}KB",
                        can_auto_fix=False,
                        metadata={
                            "file": str(today_file),
                            "size_kb": size_kb,
                            "suggestion": "Consider archiving completed sections"
                        }
                    )
                
            except Exception as e:
                return Issue(
                    severity=Severity.P2,
                    category=Category.DATA_INTEGRITY,
                    system="memory",
                    message=f"Failed to read memory file: {str(e)}",
                    can_auto_fix=False,
                    metadata={
                        "file": str(today_file),
                        "error": str(e),
                        "type": type(e).__name__
                    }
                )
        
        # All checks passed
        return None
