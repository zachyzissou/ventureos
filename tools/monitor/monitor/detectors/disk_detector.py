"""
Disk Space Health Detector
Phase Zero Day 2: Core Detectors

Monitors disk space usage and alerts when thresholds exceeded.
"""

import asyncio
import time
from typing import Optional


from monitor.detector import InfrastructureDetector
from monitor.models import Issue, HealthCheck, Severity, Category, Status


class DiskDetector(InfrastructureDetector):
    """Detects disk space issues"""
    
    async def check(self) -> Optional[Issue]:
        """Check disk space usage"""
        
        workspace_path = self.config.get("paths", {}).get("workspace", "/Users/zachgonser/clawd")
        warning_percent = self.get_threshold("warning_percent", 85)
        critical_percent = self.get_threshold("critical_percent", 90)
        
        try:
            # Run df command to get disk usage
            proc = await asyncio.create_subprocess_exec(
                "df", "-h", workspace_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            output = stdout.decode()
            lines = output.strip().split('\n')
            
            if len(lines) < 2:
                return Issue(
                    severity=Severity.P2,
                    category=Category.INFRASTRUCTURE,
                    system="disk",
                    message="Unable to parse disk usage output",
                    can_auto_fix=False,
                    metadata={"output": output}
                )
            
            # Parse the data line (second line)
            data_line = lines[1].split()
            if len(data_line) < 5:
                return Issue(
                    severity=Severity.P2,
                    category=Category.INFRASTRUCTURE,
                    system="disk",
                    message="Unexpected df output format",
                    can_auto_fix=False,
                    metadata={"line": lines[1]}
                )
            
            # Extract usage percentage (remove % sign)
            usage_str = data_line[4].rstrip('%')
            usage_percent = int(usage_str)
            
            # Extract sizes
            size = data_line[1]
            used = data_line[2]
            available = data_line[3]
            mount_point = data_line[5] if len(data_line) > 5 else workspace_path
            
            # Check thresholds
            if usage_percent >= critical_percent:
                return Issue(
                    severity=Severity.P0,
                    category=Category.INFRASTRUCTURE,
                    system="disk",
                    message=f"Disk usage critical: {usage_percent}% (threshold: {critical_percent}%)",
                    can_auto_fix=True,
                    metadata={
                        "usage_percent": usage_percent,
                        "size": size,
                        "used": used,
                        "available": available,
                        "mount_point": mount_point,
                        "threshold": critical_percent
                    }
                )
            
            elif usage_percent >= warning_percent:
                return Issue(
                    severity=Severity.P2,
                    category=Category.INFRASTRUCTURE,
                    system="disk",
                    message=f"Disk usage warning: {usage_percent}% (threshold: {warning_percent}%)",
                    can_auto_fix=True,
                    metadata={
                        "usage_percent": usage_percent,
                        "size": size,
                        "used": used,
                        "available": available,
                        "mount_point": mount_point,
                        "threshold": warning_percent
                    }
                )
            
            # Disk usage is OK
            return None
            
        except ValueError as e:
            return Issue(
                severity=Severity.P2,
                category=Category.INFRASTRUCTURE,
                system="disk",
                message=f"Failed to parse disk usage percentage: {str(e)}",
                can_auto_fix=False,
                metadata={"error": str(e)}
            )
        
        except Exception as e:
            return Issue(
                severity=Severity.P2,
                category=Category.INFRASTRUCTURE,
                system="disk",
                message=f"Disk check failed: {str(e)}",
                can_auto_fix=False,
                metadata={"error": str(e), "type": type(e).__name__}
            )
    
    async def health_check(self) -> HealthCheck:
        """Perform disk space health check"""
        
        start_time = time.time()
        issue = await self.check()
        response_time_ms = int((time.time() - start_time) * 1000)
        
        if issue is None:
            status = Status.OK
            metadata = {"status": "healthy"}
        elif issue.severity == Severity.P0:
            status = Status.ERROR
            metadata = issue.metadata
        else:
            status = Status.WARNING
            metadata = issue.metadata
        
        return HealthCheck(
            category=Category.INFRASTRUCTURE,
            system="disk",
            check_name="disk_space",
            status=status,
            response_time_ms=response_time_ms,
            metadata=metadata
        )
