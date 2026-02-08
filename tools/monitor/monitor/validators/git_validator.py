"""
Git Repository Validator
Phase Zero Day 3: Data Validators

Validates git repository status (uncommitted changes, sync status).
"""

import asyncio
import subprocess
from pathlib import Path
from typing import Optional

from monitor.validator import BaseValidator
from monitor.models import Issue, Severity, Category


class GitValidator(BaseValidator):
    """Validates git repository status"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.workspace = Path(config.get("paths", {}).get("workspace", "/Users/zachgonser/clawd"))
    
    async def validate(self, data: any = None) -> Optional[Issue]:
        """Validate git repository status"""
        
        # Check if workspace is a git repo
        git_dir = self.workspace / ".git"
        if not git_dir.exists():
            return Issue(
                severity=Severity.P2,
                category=Category.DATA_INTEGRITY,
                system="git",
                message=f"Workspace is not a git repository: {self.workspace}",
                can_auto_fix=False,
                metadata={"workspace": str(self.workspace)}
            )
        
        try:
            # Check for uncommitted changes
            proc = await asyncio.create_subprocess_exec(
                "git", "status", "--porcelain",
                cwd=self.workspace,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            output = stdout.decode().strip()
            
            if output:
                # Count number of changed files
                lines = output.split('\n')
                num_files = len(lines)
                max_uncommitted = self.get_threshold("max_uncommitted_files", 50)
                
                if num_files > max_uncommitted:
                    return Issue(
                        severity=Severity.P2,
                        category=Category.DATA_INTEGRITY,
                        system="git",
                        message=f"Too many uncommitted files: {num_files}",
                        can_auto_fix=True,
                        metadata={
                            "num_files": num_files,
                            "max_allowed": max_uncommitted,
                            "action": "auto_commit",
                            "preview": lines[:10]  # First 10 files
                        }
                    )
                
                elif num_files > 0:
                    # Some uncommitted changes, but within threshold
                    return Issue(
                        severity=Severity.P3,
                        category=Category.DATA_INTEGRITY,
                        system="git",
                        message=f"Uncommitted changes detected: {num_files} files",
                        can_auto_fix=True,
                        metadata={
                            "num_files": num_files,
                            "action": "auto_commit",
                            "files": lines
                        }
                    )
            
            # No uncommitted changes - all clean
            return None
            
        except Exception as e:
            return Issue(
                severity=Severity.P2,
                category=Category.DATA_INTEGRITY,
                system="git",
                message=f"Git status check failed: {str(e)}",
                can_auto_fix=False,
                metadata={
                    "error": str(e),
                    "type": type(e).__name__
                }
            )
