#!/usr/bin/env python3
"""
Test suite for healer implementations
"""

import asyncio
from datetime import datetime
from monitor.models import Issue, Severity, Category
from monitor.healers import GatewayHealer, CronHealer, DiskHealer, GitHealer


async def test_gateway_healer():
    """Test GatewayHealer can identify healable issues"""
    print("\n=== Testing GatewayHealer ===")
    
    healer = GatewayHealer()
    
    # Create a healable gateway issue
    issue = Issue(
        severity=Severity.P0,
        category=Category.INFRASTRUCTURE,
        system="gateway",
        message="Gateway daemon is not responding",
        can_auto_fix=True,
        metadata={}
    )
    
    can_heal = await healer.can_heal_issue(issue)
    print(f"Can heal gateway issue: {can_heal} ✅")
    assert can_heal, "GatewayHealer should be able to heal gateway issues"
    
    # Create a non-healable issue
    other_issue = Issue(
        severity=Severity.P1,
        category=Category.SECURITY,
        system="api",
        message="API auth failed",
        can_auto_fix=False,
        metadata={}
    )
    
    cannot_heal = await healer.can_heal_issue(other_issue)
    print(f"Cannot heal non-gateway issue: {not cannot_heal} ✅")
    assert not cannot_heal, "GatewayHealer should not heal non-gateway issues"


async def test_cron_healer():
    """Test CronHealer can identify healable issues"""
    print("\n=== Testing CronHealer ===")
    
    healer = CronHealer()
    
    # Create a healable cron issue
    issue = Issue(
        severity=Severity.P1,
        category=Category.INFRASTRUCTURE,
        system="cron",
        message="StantonTimes P0 Monitor is disabled",
        can_auto_fix=True,
        metadata={"jobs": ["stanton-times-p0-monitor"]}
    )
    
    can_heal = await healer.can_heal_issue(issue)
    print(f"Can heal cron issue: {can_heal} ✅")
    assert can_heal, "CronHealer should be able to heal cron issues"


async def test_disk_healer():
    """Test DiskHealer can identify healable issues"""
    print("\n=== Testing DiskHealer ===")
    
    healer = DiskHealer()
    
    # Create a healable disk issue
    issue = Issue(
        severity=Severity.P2,
        category=Category.INFRASTRUCTURE,
        system="disk",
        message="Disk usage at 87%",
        can_auto_fix=True,
        metadata={"usage_percent": 87}
    )
    
    can_heal = await healer.can_heal_issue(issue)
    print(f"Can heal disk issue: {can_heal} ✅")
    assert can_heal, "DiskHealer should be able to heal disk issues"


async def test_git_healer():
    """Test GitHealer can identify healable issues"""
    print("\n=== Testing GitHealer ===")
    
    healer = GitHealer()
    
    # Create a healable git issue
    issue = Issue(
        severity=Severity.P3,
        category=Category.DATA_INTEGRITY,
        system="git",
        message="11 files with uncommitted changes",
        can_auto_fix=True,
        metadata={"file_count": 11}
    )
    
    can_heal = await healer.can_heal_issue(issue)
    print(f"Can heal git issue: {can_heal} ✅")
    assert can_heal, "GitHealer should be able to heal git issues"


async def test_healer_cooldowns():
    """Test that healers respect cooldown periods"""
    print("\n=== Testing Healer Cooldowns ===")
    
    config = {"healing": {"enabled": True, "max_attempts": 3, "cooldown_seconds": 5}}
    healer = GatewayHealer(config)
    
    issue = Issue(
        severity=Severity.P0,
        category=Category.INFRASTRUCTURE,
        system="gateway",
        message="Test issue",
        can_auto_fix=True,
        metadata={}
    )
    
    # First heal attempt should be allowed
    can_heal_1 = await healer.can_heal(issue, "restart_gateway")
    print(f"First heal attempt allowed: {can_heal_1} ✅")
    assert can_heal_1, "First heal should be allowed"
    
    # Record a heal attempt
    await healer.record_heal_attempt(issue, "restart_gateway")
    
    # Second immediate attempt should be blocked by cooldown
    can_heal_2 = await healer.can_heal(issue, "restart_gateway")
    print(f"Second immediate attempt blocked: {not can_heal_2} ✅")
    assert not can_heal_2, "Second heal should be blocked by cooldown"
    
    # Different action should still be allowed
    can_heal_3 = await healer.can_heal(issue, "restart_gateway_alt")
    print(f"Different action still allowed: {can_heal_3} ✅")
    assert can_heal_3, "Different action should not be affected by cooldown"


async def main():
    """Run all healer tests"""
    print("=" * 60)
    print("HEALER TEST SUITE")
    print("=" * 60)
    
    try:
        await test_gateway_healer()
        await test_cron_healer()
        await test_disk_healer()
        await test_git_healer()
        await test_healer_cooldowns()
        
        print("\n" + "=" * 60)
        print("✅ ALL HEALER TESTS PASSED")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
