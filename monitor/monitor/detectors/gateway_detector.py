"""
Gateway Health Detector
Phase Zero Day 2: Core Detectors + Safety Features

Monitors Clawdbot Gateway daemon status and health.
Includes retry logic to prevent false positives.
"""

import asyncio
import time
from typing import Optional

from monitor.detector import InfrastructureDetector
from monitor.models import Issue, HealthCheck, Severity, Category, Status
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class GatewayDetector(InfrastructureDetector):
    """Detects Gateway health issues with retry logic"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        gateway_config = config.get("checks", {}).get("gateway", {})
        self.retry_count = gateway_config.get("retry_count", 3)
        self.retry_delay = gateway_config.get("retry_delay_seconds", 5)
        self.timeout = gateway_config.get("timeout_seconds", 10)
    
    async def _check_once(self) -> tuple[bool, Optional[str]]:
        """
        Single health check attempt.
        Returns (is_healthy, error_message)
        
        Uses process check instead of 'clawdbot status' which hangs in launchd.
        """
        try:
            # Check if clawdbot-gateway process is running
            proc = await asyncio.create_subprocess_exec(
                "pgrep", "-f", "clawdbot-gateway",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=2.0  # Much shorter timeout for simple process check
            )
            
            if proc.returncode == 0:
                # Process is running
                return (True, None)
            else:
                return (False, "Gateway process not running")
                
        except asyncio.TimeoutError:
            return (False, f"Process check timed out")
        except Exception as e:
            return (False, f"Process check error: {str(e)}")
    
    async def check(self) -> Optional[Issue]:
        """
        Check if Gateway is running and responsive.
        Uses retry logic to prevent false positives.
        """
        logger.debug("gateway_check_starting", retries=self.retry_count)
        
        last_error = None
        
        # Try multiple times before declaring unhealthy
        for attempt in range(self.retry_count):
            if attempt > 0:
                logger.debug(
                    "gateway_check_retry", 
                    attempt=attempt + 1, 
                    max_attempts=self.retry_count,
                    delay_seconds=self.retry_delay
                )
                await asyncio.sleep(self.retry_delay)
            
            is_healthy, error = await self._check_once()
            
            if is_healthy:
                # Success! Gateway is healthy
                if attempt > 0:
                    logger.info(
                        "gateway_healthy_after_retry",
                        attempts=attempt + 1
                    )
                return None
            else:
                last_error = error
                logger.warning(
                    "gateway_check_failed_attempt",
                    attempt=attempt + 1,
                    error=last_error
                )
        
        # All retries failed - gateway is definitely unhealthy
        logger.error(
            "gateway_unhealthy_verified",
            retries=self.retry_count,
            last_error=last_error
        )
        
        return Issue(
            severity=Severity.P0,
            category=Category.INFRASTRUCTURE,
            system="gateway",
            message=f"Gateway unhealthy (verified {self.retry_count}x): {last_error}",
            can_auto_fix=True,
            metadata={
                "retries": self.retry_count,
                "last_error": last_error,
                "retry_delay_seconds": self.retry_delay
            }
        )
    
    async def health_check(self) -> HealthCheck:
        """Perform health check and return status"""
        
        start_time = time.time()
        issue = await self.check()
        response_time_ms = int((time.time() - start_time) * 1000)
        
        if issue is None:
            return HealthCheck(
                category=Category.INFRASTRUCTURE,
                system="gateway",
                check_name="gateway_health",
                status=Status.OK,
                response_time_ms=response_time_ms,
                metadata={"running": True}
            )
        else:
            return HealthCheck(
                category=Category.INFRASTRUCTURE,
                system="gateway",
                check_name="gateway_health",
                status=Status.ERROR,
                response_time_ms=response_time_ms,
                metadata={"running": False, "issue": issue.message}
            )
