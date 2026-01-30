"""
State File Validator
Phase Zero Day 3: Data Validators

Validates JSON state files (syntax, schema, integrity).
"""

import json
import time
from pathlib import Path
from typing import Optional, Dict, Any

from monitor.validator import BaseValidator
from monitor.models import Issue, Severity, Category


class StateValidator(BaseValidator):
    """Validates state file integrity"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.workspace = Path(config.get("paths", {}).get("workspace", "/Users/zachgonser/clawd"))
        
        # Define state files to monitor
        self.state_files = [
            self.workspace / "skills" / "stanton-times" / "state.json",
            self.workspace / "memory" / "heartbeat-state.json",
        ]
    
    async def validate_file(self, file_path: Path) -> Optional[Issue]:
        """Validate a single state file"""
        
        if not file_path.exists():
            return Issue(
                severity=Severity.P2,
                category=Category.DATA_INTEGRITY,
                system="state_files",
                message=f"State file does not exist: {file_path.name}",
                can_auto_fix=True,
                metadata={
                    "file": str(file_path),
                    "action": "create_default"
                }
            )
        
        # Check if file is valid JSON
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            # Check if file is empty object/array
            if not data:
                return Issue(
                    severity=Severity.P3,
                    category=Category.DATA_INTEGRITY,
                    system="state_files",
                    message=f"State file is empty: {file_path.name}",
                    can_auto_fix=False,
                    metadata={"file": str(file_path)}
                )
            
            # Check file age (warn if very old)
            mtime = file_path.stat().st_mtime
            age_hours = (time.time() - mtime) / 3600
            max_age = self.get_threshold("max_age_hours", 24)
            
            if age_hours > max_age:
                return Issue(
                    severity=Severity.P3,
                    category=Category.DATA_INTEGRITY,
                    system="state_files",
                    message=f"State file is stale ({age_hours:.1f}h old): {file_path.name}",
                    can_auto_fix=False,
                    metadata={
                        "file": str(file_path),
                        "age_hours": age_hours,
                        "max_age_hours": max_age
                    }
                )
            
            # File is valid
            return None
            
        except json.JSONDecodeError as e:
            return Issue(
                severity=Severity.P1,
                category=Category.DATA_INTEGRITY,
                system="state_files",
                message=f"State file has invalid JSON: {file_path.name}",
                can_auto_fix=True,
                metadata={
                    "file": str(file_path),
                    "error": str(e),
                    "line": e.lineno if hasattr(e, 'lineno') else None,
                    "action": "restore_from_backup"
                }
            )
        
        except Exception as e:
            return Issue(
                severity=Severity.P2,
                category=Category.DATA_INTEGRITY,
                system="state_files",
                message=f"Failed to validate state file: {str(e)}",
                can_auto_fix=False,
                metadata={
                    "file": str(file_path),
                    "error": str(e),
                    "type": type(e).__name__
                }
            )
    
    async def validate(self, data: any = None) -> Optional[Issue]:
        """Validate all state files"""
        
        # Check each state file and return first issue found
        for file_path in self.state_files:
            issue = await self.validate_file(file_path)
            if issue:
                return issue
        
        return None
