"""
Cron Job Health Detector
Phase Zero Day 2: Core Detectors

Monitors cron job execution status and timing.
"""

import json
import time
from typing import Optional, List
from pathlib import Path


from monitor.detector import InfrastructureDetector
from monitor.models import Issue, HealthCheck, Severity, Category, Status


class CronDetector(InfrastructureDetector):
    """Detects cron job execution issues"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.cron_jobs = config.get("cron_jobs", [])
        self.cron_config_path = Path.home() / ".clawdbot" / "cron" / "jobs.json"
    
    async def check_job(self, job_config: dict) -> Optional[Issue]:
        """Check if a specific cron job is healthy"""
        
        job_id = job_config.get("id")
        expected_interval = job_config.get("interval", 3600)
        
        # Load actual cron jobs from Clawdbot config
        try:
            if not self.cron_config_path.exists():
                return Issue(
                    severity=Severity.P1,
                    category=Category.INFRASTRUCTURE,
                    system="cron",
                    message=f"Cron config file not found: {self.cron_config_path}",
                    can_auto_fix=False,
                    metadata={"job_id": job_id}
                )
            
            with open(self.cron_config_path, 'r') as f:
                cron_data = json.load(f)
            
            jobs = cron_data.get("jobs", [])
            
            # Try to find job by ID first, then by name (more flexible)
            job = next((j for j in jobs if j.get("id") == job_id), None)
            if not job:
                # Try matching by name (case-insensitive)
                job_name = job_config.get("name", "")
                if job_name:
                    job = next((j for j in jobs 
                               if j.get("name", "").lower() == job_name.lower()), None)
            
            if not job:
                return Issue(
                    severity=Severity.P2,
                    category=Category.INFRASTRUCTURE,
                    system="cron",
                    message=f"Cron job not found: {job_id}",
                    can_auto_fix=False,
                    metadata={"job_id": job_id, "searched_name": job_config.get("name", "")}
                )
            
            # Check if job is enabled
            if not job.get("enabled", True):
                return Issue(
                    severity=Severity.P2,
                    category=Category.INFRASTRUCTURE,
                    system="cron",
                    message=f"Cron job is disabled: {job_id}",
                    can_auto_fix=True,
                    metadata={"job_id": job_id, "can_re_enable": True}
                )
            
            # Check last run time (would need to parse logs or state tracking)
            # For now, return None (job exists and is enabled)
            # TODO: Implement last run time checking from logs
            
            return None
            
        except json.JSONDecodeError as e:
            return Issue(
                severity=Severity.P1,
                category=Category.INFRASTRUCTURE,
                system="cron",
                message=f"Cron config JSON is corrupted: {str(e)}",
                can_auto_fix=False,
                metadata={"job_id": job_id, "error": str(e)}
            )
        
        except Exception as e:
            return Issue(
                severity=Severity.P2,
                category=Category.INFRASTRUCTURE,
                system="cron",
                message=f"Cron job check failed for {job_id}: {str(e)}",
                can_auto_fix=False,
                metadata={"job_id": job_id, "error": str(e)}
            )
    
    async def check(self) -> Optional[Issue]:
        """Check all configured cron jobs"""
        
        # Check each job and return first issue found
        for job_config in self.cron_jobs:
            issue = await self.check_job(job_config)
            if issue:
                return issue
        
        return None
    
    async def health_check(self) -> HealthCheck:
        """Perform health check on all cron jobs"""
        
        start_time = time.time()
        
        issues_count = 0
        disabled_count = 0
        healthy_count = 0
        
        for job_config in self.cron_jobs:
            issue = await self.check_job(job_config)
            if issue:
                if "disabled" in issue.message:
                    disabled_count += 1
                else:
                    issues_count += 1
            else:
                healthy_count += 1
        
        response_time_ms = int((time.time() - start_time) * 1000)
        
        total_jobs = len(self.cron_jobs)
        
        if issues_count > 0:
            status = Status.ERROR
        elif disabled_count > 0:
            status = Status.WARNING
        else:
            status = Status.OK
        
        return HealthCheck(
            category=Category.INFRASTRUCTURE,
            system="cron",
            check_name="cron_jobs_health",
            status=status,
            response_time_ms=response_time_ms,
            metadata={
                "total_jobs": total_jobs,
                "healthy": healthy_count,
                "disabled": disabled_count,
                "issues": issues_count
            }
        )
