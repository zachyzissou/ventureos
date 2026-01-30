"""
Detector Tests
Phase Zero Day 2: Core Detectors

Simple tests to verify detectors work correctly.
"""

import asyncio
import yaml
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from detectors.gateway_detector import GatewayDetector
from detectors.cron_detector import CronDetector
from detectors.api_detector import APIDetector
from detectors.disk_detector import DiskDetector


async def test_gateway_detector():
    """Test gateway health detection"""
    print("\n=== Testing Gateway Detector ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    detector = GatewayDetector(config)
    
    # Run check
    issue = await detector.check()
    if issue:
        print(f"❌ Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
        print(f"   Can auto-fix: {issue.can_auto_fix}")
    else:
        print("✅ Gateway is healthy")
    
    # Run health check
    health = await detector.health_check()
    print(f"   Status: {health.status.value}")
    print(f"   Response time: {health.response_time_ms}ms")


async def test_cron_detector():
    """Test cron job detection"""
    print("\n=== Testing Cron Detector ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    detector = CronDetector(config)
    
    # Run check
    issue = await detector.check()
    if issue:
        print(f"❌ Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
    else:
        print("✅ All cron jobs are healthy")
    
    # Run health check
    health = await detector.health_check()
    print(f"   Status: {health.status.value}")
    print(f"   Total jobs: {health.metadata.get('total_jobs')}")
    print(f"   Healthy: {health.metadata.get('healthy')}")
    print(f"   Issues: {health.metadata.get('issues')}")


async def test_api_detector():
    """Test API health detection"""
    print("\n=== Testing API Detector ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    detector = APIDetector(config)
    
    # Run check
    issue = await detector.check()
    if issue:
        print(f"❌ Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
    else:
        print("✅ All APIs are healthy")
    
    # Run health check
    health = await detector.health_check()
    print(f"   Status: {health.status.value}")
    print(f"   Total APIs: {health.metadata.get('total_apis')}")
    print(f"   Healthy: {health.metadata.get('healthy')}")
    print(f"   Avg response: {health.metadata.get('avg_response_ms')}ms")


async def test_disk_detector():
    """Test disk space detection"""
    print("\n=== Testing Disk Detector ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    detector = DiskDetector(config)
    
    # Run check
    issue = await detector.check()
    if issue:
        print(f"⚠️  Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
        if 'usage_percent' in issue.metadata:
            print(f"   Usage: {issue.metadata['usage_percent']}%")
            print(f"   Available: {issue.metadata.get('available')}")
    else:
        print("✅ Disk space is healthy")
    
    # Run health check
    health = await detector.health_check()
    print(f"   Status: {health.status.value}")
    if 'usage_percent' in health.metadata:
        print(f"   Usage: {health.metadata['usage_percent']}%")


async def main():
    """Run all detector tests"""
    print("=" * 60)
    print("PHASE ZERO DAY 2: Core Detector Tests")
    print("=" * 60)
    
    try:
        await test_gateway_detector()
        await test_cron_detector()
        await test_api_detector()
        await test_disk_detector()
        
        print("\n" + "=" * 60)
        print("✅ All detector tests complete")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Test suite failed: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
