"""
API Health Detector
Phase Zero: Architecture Fix

Monitors API connectivity using shared HTTP client.
"""

import time
from typing import Optional
from monitor.detector import InfrastructureDetector
from monitor.models import Issue, HealthCheck, Severity, Category, Status
from monitor.http_client import HTTPClientManager
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class APIDetector(InfrastructureDetector):
    """Detects API connectivity and health issues using shared HTTP client"""
    
    def __init__(self, config: dict, http_client: HTTPClientManager):
        super().__init__(config)
        self.apis = config.get("apis", [])
        self.http_manager = http_client
    
    async def check_api(self, api_config: dict) -> Optional[Issue]:
        """Check if a specific API is healthy"""
        
        name = api_config.get("name")
        url = api_config.get("url")
        method = api_config.get("method", "GET")
        timeout = api_config.get("timeout", 5000) / 1000.0
        
        if not self.http_manager.is_ready():
            logger.error("HTTP client not initialized", api=name)
            return Issue(
                severity=Severity.P0,
                category=Category.INFRASTRUCTURE,
                system="api",
                message=f"HTTP client not initialized for {name}",
                can_auto_fix=False,
                metadata={"api": name, "url": url}
            )
        
        client = self.http_manager.client
        
        try:
            # Use shared client with connection pooling
            if method == "GET":
                response = await client.get(url, timeout=timeout)
            elif method == "OPTIONS":
                response = await client.options(url, timeout=timeout)
            elif method == "HEAD":
                response = await client.head(url, timeout=timeout)
            else:
                return Issue(
                    severity=Severity.P2,
                    category=Category.INFRASTRUCTURE,
                    system="api",
                    message=f"Unsupported HTTP method for {name}: {method}",
                    can_auto_fix=False,
                    metadata={"api": name, "method": method}
                )
            
            # Check response status
            if response.status_code >= 500:
                return Issue(
                    severity=Severity.P1,
                    category=Category.INFRASTRUCTURE,
                    system="api",
                    message=f"API {name} returned server error: {response.status_code}",
                    can_auto_fix=False,
                    metadata={
                        "api": name,
                        "status_code": response.status_code,
                        "url": url
                    }
                )
            
            elif response.status_code >= 400:
                return Issue(
                    severity=Severity.P1,
                    category=Category.INFRASTRUCTURE,
                    system="api",
                    message=f"API {name} returned client error: {response.status_code}",
                    can_auto_fix=True if response.status_code == 401 else False,
                    metadata={
                        "api": name,
                        "status_code": response.status_code,
                        "url": url,
                        "possible_auth_issue": response.status_code == 401
                    }
                )
            
            # Success (2xx or 3xx)
            logger.debug("API check passed", api=name, status_code=response.status_code)
            return None
            
        except Exception as e:
            # Specific exception handling
            error_type = type(e).__name__
            
            if "Timeout" in error_type:
                severity = Severity.P1
                message = f"API {name} timed out (>{timeout}s)"
            elif "Connect" in error_type:
                severity = Severity.P1
                message = f"API {name} connection failed"
            else:
                severity = Severity.P2
                message = f"API {name} check failed: {str(e)}"
            
            logger.warning("API check failed",
                         api=name,
                         error=str(e),
                         error_type=error_type)
            
            return Issue(
                severity=severity,
                category=Category.INFRASTRUCTURE,
                system="api",
                message=message,
                can_auto_fix=False,
                metadata={
                    "api": name,
                    "error": str(e),
                    "type": error_type,
                    "url": url
                }
            )
    
    async def check(self) -> Optional[Issue]:
        """Check all configured APIs"""
        
        # Check each API and return first issue found
        for api_config in self.apis:
            issue = await self.check_api(api_config)
            if issue:
                return issue
        
        return None
    
    async def health_check(self) -> HealthCheck:
        """Perform health check on all APIs"""
        
        start_time = time.time()
        
        issues_count = 0
        healthy_count = 0
        response_times = []
        
        for api_config in self.apis:
            api_start = time.time()
            issue = await self.check_api(api_config)
            api_duration = int((time.time() - api_start) * 1000)
            response_times.append(api_duration)
            
            if issue:
                issues_count += 1
            else:
                healthy_count += 1
        
        total_time_ms = int((time.time() - start_time) * 1000)
        avg_response_ms = sum(response_times) // len(response_times) if response_times else 0
        
        total_apis = len(self.apis)
        
        if issues_count > 0:
            status = Status.ERROR if issues_count == total_apis else Status.WARNING
        else:
            status = Status.OK
        
        return HealthCheck(
            category=Category.INFRASTRUCTURE,
            system="api",
            check_name="api_health",
            status=status,
            response_time_ms=total_time_ms,
            metadata={
                "total_apis": total_apis,
                "healthy": healthy_count,
                "issues": issues_count,
                "avg_response_ms": avg_response_ms
            }
        )
