"""
HTTP Client Manager
Phase Zero: Architecture Fix

Shared HTTP client with connection pooling and lifecycle management.
"""

import httpx
from typing import Optional
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class HTTPClientManager:
    """
    Manages a shared async HTTP client with connection pooling.
    
    Use as async context manager:
        async with HTTPClientManager() as client:
            response = await client.get(url)
    
    Or as singleton:
        manager = HTTPClientManager()
        await manager.start()
        # ... use manager.client ...
        await manager.stop()
    """
    
    _instance: Optional['HTTPClientManager'] = None
    
    def __init__(self, timeout: float = 10.0, max_connections: int = 100):
        self.timeout = timeout
        self.max_connections = max_connections
        self.client: Optional[httpx.AsyncClient] = None
    
    @classmethod
    def get_instance(cls) -> 'HTTPClientManager':
        """Get singleton instance"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    async def __aenter__(self):
        """Async context manager entry"""
        await self.start()
        return self.client
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.stop()
    
    async def start(self):
        """Initialize the HTTP client"""
        if self.client:
            logger.warning("HTTP client already initialized")
            return
        
        try:
            self.client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                limits=httpx.Limits(
                    max_connections=self.max_connections,
                    max_keepalive_connections=20
                ),
                follow_redirects=True,
            )
            logger.info("HTTP client initialized",
                       timeout=self.timeout,
                       max_connections=self.max_connections)
        except Exception as e:
            logger.error("Failed to initialize HTTP client", error=str(e))
            raise
    
    async def stop(self):
        """Close the HTTP client and cleanup connections"""
        if self.client:
            try:
                await self.client.aclose()
                logger.info("HTTP client closed")
            except Exception as e:
                logger.error("Failed to close HTTP client", error=str(e))
            finally:
                self.client = None
    
    def is_ready(self) -> bool:
        """Check if client is initialized and ready"""
        return self.client is not None
