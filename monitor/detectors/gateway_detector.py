"""
Gateway Health Detector
Phase Zero Day 2: Core Detectors

Monitors Clawdbot Gateway daemon status and health.
"""

import asyncio
import time
from typing import Optional
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from detector import InfrastructureDetector
from models import Issue, HealthCheck, Severity, Category, Status


class GatewayDetector(InfrastructureDetector):
    """Detects Gateway health issues"""
    
    async def check(self) -> Optional[Issue]:
        """Check if Gateway is running and responsive"""
        
        # Check if gateway process is running
        try:
            proc = await asyncio.create_subprocess_exec(
                "clawdbot", "status",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)
            
            output = stdout.decode()
            
            # Check if output indicates gateway is running
            if "Running" not in output and "running" not in output:
                return Issue(
                    severity=Severity.P0,
                    category=Category.INFRASTRUCTURE,
                    system="gateway",
                    message="Gateway is not running",
                    can_auto_fix=True,
                    metadata={"output": output, "stderr": stderr.decode()}
                )
            
            # Gateway is running - no issue
            return None
            
        except asyncio.TimeoutError:
            return Issue(
                severity=Severity.P0,
                category=Category.INFRASTRUCTURE,
                system="gateway",
                message="Gateway status check timed out (>10s)",
                can_auto_fix=True,
                metadata={"timeout": 10.0}
            )
        
        except Exception as e:
            return Issue(
                severity=Severity.P0,
                category=Category.INFRASTRUCTURE,
                system="gateway",
                message=f"Gateway status check failed: {str(e)}",
                can_auto_fix=False,
                metadata={"error": str(e), "type": type(e).__name__}
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
