#!/usr/bin/env python3
"""
Cron Healer - Auto-fix disabled/missing cron jobs
"""

import asyncio
import json
from pathlib import Path
from typing import Optional
from monitor.models import Issue, HealResult
from monitor.healer import BaseHealer
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class CronHealer(BaseHealer):
    """Heals cron job issues by enabling/recreating jobs"""
    
    def __init__(self, config: dict = None):
        if config is None:
            config = {"healing": {"enabled": True, "max_attempts": 3, "cooldown_seconds": 600}}
        super().__init__(config)
        self.jobs_path = Path.home() / ".openclaw" / "cron" / "jobs.json"
        
    async def can_heal_issue(self, issue: Issue) -> bool:
        """Check if this healer can fix the issue type"""
        from monitor.models import Category
        return (
            issue.category == Category.INFRASTRUCTURE and
            issue.system == "cron" and
            issue.can_auto_fix
        )
    
    async def heal(self, issue: Issue) -> HealResult:
        """Enable disabled cron jobs or recreate missing ones"""
        logger.info("attempting_cron_heal", issue_id=issue.id, dry_run=self.dry_run)
        
        # DRY RUN MODE: Log but don't execute
        if self.dry_run:
            affected_jobs = issue.metadata.get("jobs", [])
            logger.warning(
                "dry_run_cron_enable",
                issue_id=issue.id,
                jobs=affected_jobs,
                message="DRY RUN: Would enable cron job(s), but dry_run=true"
            )
            return HealResult(
                success=True,
                action_taken="cron enable (dry-run)",
                message=f"DRY RUN: Would have enabled {len(affected_jobs)} cron job(s)",
                metadata={"dry_run": True, "jobs": affected_jobs}
            )
        
        try:
            # Load jobs configuration
            if not self.jobs_path.exists():
                logger.error("jobs_file_missing", path=str(self.jobs_path))
                return HealResult(
                    success=False,
                    message=f"Jobs file not found: {self.jobs_path}",
                    metadata={"path": str(self.jobs_path)}
                )
            
            with open(self.jobs_path, 'r') as f:
                jobs_data = json.load(f)
            
            jobs = jobs_data.get("jobs", [])
            fixed_count = 0
            
            # Check metadata for which jobs are affected
            affected_jobs = issue.metadata.get("jobs", [])
            
            for job_id in affected_jobs:
                # Find the job
                job = next((j for j in jobs if j.get("id") == job_id), None)
                
                if job is None:
                    logger.warning("job_not_found", job_id=job_id)
                    continue
                
                # If disabled, enable it
                if not job.get("enabled", True):
                    logger.info("enabling_job", job_id=job_id)
                    job["enabled"] = True
                    fixed_count += 1
            
            if fixed_count > 0:
                # Write back the updated jobs
                with open(self.jobs_path, 'w') as f:
                    json.dump(jobs_data, f, indent=2)
                
                logger.info("cron_heal_success", fixed_count=fixed_count)
                return HealResult(
                    success=True,
                    message=f"Enabled {fixed_count} disabled cron job(s)",
                    metadata={"fixed_count": fixed_count, "jobs": affected_jobs}
                )
            else:
                logger.info("no_cron_jobs_to_fix")
                return HealResult(
                    success=True,
                    message="No cron jobs needed fixing",
                    metadata={"jobs_checked": len(affected_jobs)}
                )
                
        except json.JSONDecodeError as e:
            logger.error("jobs_file_corrupt", error=str(e))
            return HealResult(
                success=False,
                message=f"Jobs file is corrupted: {str(e)}",
                metadata={"error": str(e)}
            )
        except Exception as e:
            logger.error("cron_heal_exception", error=str(e))
            return HealResult(
                success=False,
                message=f"Cron heal failed: {str(e)}",
                metadata={"error": str(e), "type": type(e).__name__}
            )
