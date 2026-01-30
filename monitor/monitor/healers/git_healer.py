#!/usr/bin/env python3
"""
Git Healer - Auto-commit memory changes
"""

import asyncio
import subprocess
from pathlib import Path
from typing import Optional
from monitor.models import Issue, HealResult
from monitor.healer import BaseHealer
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class GitHealer(BaseHealer):
    """Heals git issues by auto-committing changes"""
    
    def __init__(self, config: dict = None):
        if config is None:
            config = {"healing": {"enabled": True, "max_attempts": 3, "cooldown_seconds": 1800}}
        super().__init__(config)
        self.repo_path = Path.home() / "clawd"
        
    async def can_heal_issue(self, issue: Issue) -> bool:
        """Check if this healer can fix the issue type"""
        from monitor.models import Category
        return (
            issue.category == Category.DATA_INTEGRITY and
            issue.system == "git" and
            issue.can_auto_fix
        )
    
    async def heal(self, issue: Issue) -> HealResult:
        """Auto-commit uncommitted changes"""
        logger.info("attempting_git_autocommit", issue_id=issue.id)
        
        try:
            # Get list of uncommitted files
            status_proc = await asyncio.create_subprocess_exec(
                "git", "-C", str(self.repo_path), "status", "--porcelain",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(status_proc.communicate(), timeout=10.0)
            
            if status_proc.returncode != 0:
                logger.error("git_status_failed", stderr=stderr.decode())
                return HealResult(
                    success=False,
                    action_taken="git status (failed)",
                    message=f"Git status failed: {stderr.decode()}",
                    metadata={"stderr": stderr.decode()}
                )
            
            files = stdout.decode().strip().split('\n')
            if not files or not files[0]:
                logger.info("no_uncommitted_changes")
                return HealResult(
                    success=True,
                    action_taken="git status (check)",
                    message="No uncommitted changes found",
                    metadata={"files": []}
                )
            
            # Add all changes
            logger.debug("adding_changes")
            add_proc = await asyncio.create_subprocess_exec(
                "git", "-C", str(self.repo_path), "add", "-A",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            await asyncio.wait_for(add_proc.wait(), timeout=10.0)
            
            # Commit with auto-generated message
            commit_msg = f"Auto-commit: Monitor-Agent cleanup ({len(files)} files)"
            logger.debug("committing_changes", file_count=len(files))
            commit_proc = await asyncio.create_subprocess_exec(
                "git", "-C", str(self.repo_path), "commit", "-m", commit_msg,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(commit_proc.communicate(), timeout=10.0)
            
            if commit_proc.returncode == 0:
                logger.info("git_autocommit_success", file_count=len(files))
                return HealResult(
                    success=True,
                    action_taken=f"git commit ({len(files)} files)",
                    message=f"Auto-committed {len(files)} file(s)",
                    metadata={
                        "file_count": len(files),
                        "commit_msg": commit_msg,
                        "stdout": stdout.decode()
                    }
                )
            else:
                logger.error("git_commit_failed", stderr=stderr.decode())
                return HealResult(
                    success=False,
                    action_taken="git commit (failed)",
                    message=f"Git commit failed: {stderr.decode()}",
                    metadata={"stderr": stderr.decode()}
                )
                
        except asyncio.TimeoutError:
            logger.error("git_autocommit_timeout")
            return HealResult(
                success=False,
                message="Git auto-commit timed out",
                metadata={"error": "timeout"}
            )
        except Exception as e:
            logger.error("git_autocommit_exception", error=str(e))
            return HealResult(
                success=False,
                message=f"Git auto-commit failed: {str(e)}",
                metadata={"error": str(e), "type": type(e).__name__}
            )
