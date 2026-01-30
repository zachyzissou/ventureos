#!/usr/bin/env python3
"""
Disk Healer - Auto-cleanup disk space issues
"""

import asyncio
import subprocess
from pathlib import Path
from typing import Optional
from monitor.models import Issue, HealResult
from monitor.healer import BaseHealer
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class DiskHealer(BaseHealer):
    """Heals disk space issues by cleaning up temp files and logs"""
    
    def __init__(self, config: dict = None):
        if config is None:
            config = {"healing": {"enabled": True, "max_attempts": 3, "cooldown_seconds": 3600}}
        super().__init__(config)
        
    async def can_heal_issue(self, issue: Issue) -> bool:
        """Check if this healer can fix the issue type"""
        from monitor.models import Category
        return (
            issue.category == Category.INFRASTRUCTURE and
            issue.system == "disk" and
            issue.can_auto_fix
        )
    
    async def heal(self, issue: Issue) -> HealResult:
        """Clean up disk space by removing temp files and old logs"""
        logger.info("attempting_disk_cleanup", issue_id=issue.id)
        
        try:
            cleaned_bytes = 0
            actions = []
            
            # 1. Clean up old logs in ~/.clawdbot/logs (>7 days)
            logs_dir = Path.home() / ".clawdbot" / "logs"
            if logs_dir.exists():
                logger.debug("cleaning_old_logs")
                find_proc = await asyncio.create_subprocess_exec(
                    "find", str(logs_dir), "-name", "*.log", "-mtime", "+7", "-delete", "-print",
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                stdout, _ = await asyncio.wait_for(find_proc.communicate(), timeout=60.0)
                deleted_logs = stdout.decode().strip().split('\n') if stdout else []
                if deleted_logs and deleted_logs[0]:
                    actions.append(f"Deleted {len(deleted_logs)} old log files")
                    logger.info("deleted_old_logs", count=len(deleted_logs))
            
            # 2. Clean up temp directory
            temp_dir = Path("/tmp")
            logger.debug("cleaning_temp_files")
            find_proc = await asyncio.create_subprocess_exec(
                "find", str(temp_dir), "-name", "clawdbot-*", "-mtime", "+1", "-delete", "-print",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(find_proc.communicate(), timeout=60.0)
            deleted_temp = stdout.decode().strip().split('\n') if stdout else []
            if deleted_temp and deleted_temp[0]:
                actions.append(f"Deleted {len(deleted_temp)} temp files")
                logger.info("deleted_temp_files", count=len(deleted_temp))
            
            # 3. Clean up old npm cache (>30 days)
            npm_cache = Path.home() / ".npm" / "_cacache"
            if npm_cache.exists():
                logger.debug("cleaning_npm_cache")
                find_proc = await asyncio.create_subprocess_exec(
                    "find", str(npm_cache), "-mtime", "+30", "-delete", "-print",
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                stdout, _ = await asyncio.wait_for(find_proc.communicate(), timeout=120.0)
                deleted_npm = stdout.decode().strip().split('\n') if stdout else []
                if deleted_npm and deleted_npm[0]:
                    actions.append(f"Cleaned npm cache ({len(deleted_npm)} files)")
                    logger.info("cleaned_npm_cache", count=len(deleted_npm))
            
            # 4. Clean up Python __pycache__ directories
            clawd_dir = Path.home() / "clawd"
            if clawd_dir.exists():
                logger.debug("cleaning_pycache")
                find_proc = await asyncio.create_subprocess_exec(
                    "find", str(clawd_dir), "-name", "__pycache__", "-type", "d", "-exec", "rm", "-rf", "{}", "+",
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                await asyncio.wait_for(find_proc.wait(), timeout=60.0)
                actions.append("Cleaned Python __pycache__ directories")
            
            if actions:
                message = "Disk cleanup completed: " + "; ".join(actions)
                logger.info("disk_cleanup_success", actions=actions)
                return HealResult(
                    success=True,
                    message=message,
                    metadata={"actions": actions}
                )
            else:
                logger.info("no_cleanup_needed")
                return HealResult(
                    success=True,
                    message="No cleanup actions needed",
                    metadata={"actions": []}
                )
                
        except asyncio.TimeoutError:
            logger.error("disk_cleanup_timeout")
            return HealResult(
                success=False,
                message="Disk cleanup timed out",
                metadata={"error": "timeout"}
            )
        except Exception as e:
            logger.error("disk_cleanup_exception", error=str(e))
            return HealResult(
                success=False,
                message=f"Disk cleanup failed: {str(e)}",
                metadata={"error": str(e), "type": type(e).__name__}
            )
