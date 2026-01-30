#!/usr/bin/env python3
"""
Gateway Healer - Auto-restart crashed/unresponsive gateway
"""

import asyncio
import subprocess
from typing import Optional
from monitor.models import Issue, HealResult
from monitor.healer import BaseHealer
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class GatewayHealer(BaseHealer):
    """Heals gateway issues by restarting the daemon"""
    
    def __init__(self, config: dict = None):
        if config is None:
            config = {"healing": {"enabled": True, "max_attempts": 3, "cooldown_seconds": 300}}
        super().__init__(config)
        
    async def can_heal_issue(self, issue: Issue) -> bool:
        """Check if this healer can fix the issue type"""
        from monitor.models import Category
        # Only heal gateway issues marked as auto-fixable
        return (
            issue.category == Category.INFRASTRUCTURE and
            issue.system == "gateway" and
            issue.can_auto_fix
        )
    
    async def heal(self, issue: Issue) -> HealResult:
        """Restart the gateway daemon"""
        logger.info("attempting_gateway_restart", issue_id=issue.id)
        
        try:
            # First, try to stop gracefully
            logger.debug("stopping_gateway")
            stop_proc = await asyncio.create_subprocess_exec(
                "clawdbot", "gateway", "stop",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            await asyncio.wait_for(stop_proc.wait(), timeout=30.0)
            
            # Wait a moment
            await asyncio.sleep(2)
            
            # Start the gateway
            logger.debug("starting_gateway")
            start_proc = await asyncio.create_subprocess_exec(
                "clawdbot", "gateway", "start",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(
                start_proc.communicate(), 
                timeout=30.0
            )
            
            if start_proc.returncode == 0:
                logger.info("gateway_restart_success")
                return HealResult(
                    success=True,
                    message="Gateway restarted successfully",
                    metadata={"stdout": stdout.decode(), "stderr": stderr.decode()}
                )
            else:
                logger.error("gateway_restart_failed", returncode=start_proc.returncode)
                return HealResult(
                    success=False,
                    message=f"Gateway start failed with code {start_proc.returncode}",
                    metadata={"stdout": stdout.decode(), "stderr": stderr.decode()}
                )
                
        except asyncio.TimeoutError:
            logger.error("gateway_restart_timeout")
            return HealResult(
                success=False,
                message="Gateway restart timed out (>30s)",
                metadata={"error": "timeout"}
            )
        except Exception as e:
            logger.error("gateway_restart_exception", error=str(e))
            return HealResult(
                success=False,
                message=f"Gateway restart failed: {str(e)}",
                metadata={"error": str(e), "type": type(e).__name__}
            )
