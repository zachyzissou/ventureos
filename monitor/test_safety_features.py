#!/usr/bin/env python3
"""
Safety Features Test Suite
Verifies dry-run mode, retry logic, and manual approval
"""

import asyncio
from monitor.models import Issue, Severity, Category
from monitor.healers.gateway_healer import GatewayHealer
from monitor.healers.cron_healer import CronHealer
from monitor.healers.disk_healer import DiskHealer
from monitor.healers.git_healer import GitHealer
from monitor.detectors.gateway_detector import GatewayDetector


async def test_dry_run_mode():
    """Test that dry-run mode prevents actual execution"""
    print("\n=== Testing Dry-Run Mode ===")
    
    # Config with dry_run enabled
    config = {
        "healing": {
            "enabled": True,
            "dry_run": True,  # SAFETY: Enabled
            "max_attempts": 3,
            "cooldown_seconds": 300
        }
    }
    
    # Test gateway healer in dry-run
    healer = GatewayHealer(config)
    issue = Issue(
        severity=Severity.P0,
        category=Category.INFRASTRUCTURE,
        system="gateway",
        message="Test gateway issue",
        can_auto_fix=True,
        metadata={}
    )
    
    result = await healer.heal(issue)
    
    assert result.success == True, "Dry-run should succeed"
    assert "dry-run" in result.action_taken.lower(), "Should indicate dry-run"
    assert result.metadata.get("dry_run") == True, "Metadata should show dry_run=true"
    
    print("✅ Dry-run mode working - no actual execution")
    return True


async def test_gateway_retry_logic():
    """Test that gateway detector retries before declaring unhealthy"""
    print("\n=== Testing Gateway Retry Logic ===")
    
    config = {
        "checks": {
            "gateway": {
                "enabled": True,
                "frequency_seconds": 60,
                "timeout_seconds": 10,
                "retry_count": 3,
                "retry_delay_seconds": 1  # Short delay for testing
            }
        }
    }
    
    detector = GatewayDetector(config)
    
    # This should check gateway 3 times before returning an issue
    # (will fail in test env, but we're checking the retry logic)
    issue = await detector.check()
    
    if issue:
        # Should have retry info in metadata
        assert issue.metadata.get("retries") == 3, "Should have attempted 3 retries"
        print(f"✅ Retry logic working - attempted {issue.metadata.get('retries')} checks")
    else:
        print("✅ Gateway is healthy (no retries needed)")
    
    return True


async def test_manual_approval():
    """Test that manual approval is required for critical actions"""
    print("\n=== Testing Manual Approval ===")
    
    config = {
        "healing": {
            "enabled": True,
            "dry_run": False,  # Not in dry-run
            "manual_approval_required": ["gateway_restart"],  # Require approval
            "max_attempts": 3,
            "cooldown_seconds": 300
        }
    }
    
    healer = GatewayHealer(config)
    issue = Issue(
        severity=Severity.P0,
        category=Category.INFRASTRUCTURE,
        system="gateway",
        message="Test gateway issue",
        can_auto_fix=True,
        metadata={}
    )
    
    # Should require approval
    requires_approval = await healer.requires_approval("gateway_restart")
    assert requires_approval == True, "Should require approval"
    
    # Should deny without approval system implemented
    result = await healer.heal(issue)
    assert result.success == False, "Should fail without approval"
    assert "denied" in result.message.lower() or "approval" in result.message.lower()
    
    print("✅ Manual approval working - critical actions blocked")
    return True


async def test_all_healers_dry_run():
    """Test that all healers support dry-run mode"""
    print("\n=== Testing All Healers Support Dry-Run ===")
    
    config = {
        "healing": {
            "enabled": True,
            "dry_run": True,
            "max_attempts": 3,
            "cooldown_seconds": 300
        }
    }
    
    healers = [
        ("GatewayHealer", GatewayHealer(config)),
        ("CronHealer", CronHealer(config)),
        ("DiskHealer", DiskHealer(config)),
        ("GitHealer", GitHealer(config))
    ]
    
    for name, healer in healers:
        assert healer.dry_run == True, f"{name} should be in dry-run mode"
        print(f"  ✅ {name} in dry-run mode")
    
    print("✅ All healers support dry-run")
    return True


async def main():
    """Run all safety tests"""
    print("=" * 60)
    print("SAFETY FEATURES TEST SUITE")
    print("=" * 60)
    
    tests = [
        ("Dry-Run Mode", test_dry_run_mode),
        ("Gateway Retry Logic", test_gateway_retry_logic),
        ("Manual Approval", test_manual_approval),
        ("All Healers Dry-Run", test_all_healers_dry_run)
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = await test_func()
            results.append((name, result, None))
        except Exception as e:
            results.append((name, False, str(e)))
            print(f"❌ {name} failed: {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result, _ in results if result)
    total = len(results)
    
    for name, result, error in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
        if error:
            print(f"        Error: {error}")
    
    print(f"\nPassed: {passed}/{total}")
    
    if passed == total:
        print("\n🎉 ALL SAFETY FEATURES WORKING!")
        return 0
    else:
        print("\n⚠️  SOME SAFETY FEATURES FAILED - DO NOT DEPLOY")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
