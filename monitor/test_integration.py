#!/usr/bin/env python3
"""
Integration test - verify all components work together
"""

import asyncio
import sys
from pathlib import Path

# Add parent directories to path for detectors/validators
sys.path.insert(0, str(Path(__file__).parent))

from monitor.models import Issue, HealResult, Severity, Category
from detectors.gateway_detector import GatewayDetector
from detectors.api_detector import APIDetector
from validators.memory_validator import MemoryValidator
from validators.git_validator import GitValidator
from monitor.healers import GatewayHealer, CronHealer, DiskHealer, GitHealer
from monitor.alerters import DiscordAlerter
from monitor.state_db import StateDatabase


async def test_full_workflow():
    """Test the complete detection → healing → alerting workflow"""
    print("\n" + "=" * 60)
    print("INTEGRATION TEST: Full Workflow")
    print("=" * 60)
    
    # 1. DETECTION: Create a detector
    print("\n1. DETECTION PHASE")
    print("-" * 40)
    gateway_detector = GatewayDetector({})
    print("✅ GatewayDetector initialized")
    
    # 2. VALIDATION: Create validators
    print("\n2. VALIDATION PHASE")
    print("-" * 40)
    memory_validator = MemoryValidator({})
    git_validator = GitValidator({})
    print("✅ Validators initialized")
    
    # 3. HEALING: Create healers
    print("\n3. HEALING PHASE")
    print("-" * 40)
    gateway_healer = GatewayHealer()
    disk_healer = DiskHealer()
    print("✅ Healers initialized")
    
    # 4. ALERTING: Create alerter
    print("\n4. ALERTING PHASE")
    print("-" * 40)
    alerter = DiscordAlerter()
    print("✅ Alerter initialized")
    
    # 5. DATABASE: Test persistence
    print("\n5. DATABASE PHASE")
    print("-" * 40)
    async with StateDatabase() as db:
        # Create a test issue
        issue = Issue(
            severity=Severity.P1,
            category=Category.INFRASTRUCTURE,
            system="test_system",
            message="Integration test issue",
            can_auto_fix=True,
            metadata={"test": True}
        )
        
        # Store issue
        await db.store_issue(issue)
        print(f"✅ Issue stored: {issue.id[:8]}")
        
        # Check if healer can handle it
        can_heal = await gateway_healer.can_heal_issue(issue)
        print(f"   Gateway healer can handle: {can_heal}")
        
        can_heal_disk = await disk_healer.can_heal_issue(issue)
        print(f"   Disk healer can handle: {can_heal_disk}")
        
        # Check if alerter should alert
        should_alert = await alerter.should_alert(issue)
        print(f"   Alerter should alert: {should_alert}")
        
        # Simulate heal result
        heal_result = HealResult(
            success=True,
            message="Test heal successful",
            action_taken="test_action",
            metadata={"healer": "test"}
        )
        
        # Store heal attempt
        await db.store_heal_attempt(issue.id, heal_result)
        print(f"✅ Heal attempt stored")
        
        # Retrieve recent issues
        recent = await db.get_recent_issues(limit=5)
        print(f"✅ Retrieved {len(recent)} recent issues")
    
    print("\n" + "=" * 60)
    print("✅ INTEGRATION TEST PASSED")
    print("=" * 60)
    print("\nAll components can:")
    print("  • Initialize independently")
    print("  • Store/retrieve from database")
    print("  • Make routing decisions (can_heal, should_alert)")
    print("  • Work with shared models (Issue, HealResult)")


async def test_component_interactions():
    """Test that components properly interact"""
    print("\n" + "=" * 60)
    print("INTEGRATION TEST: Component Interactions")
    print("=" * 60)
    
    # Create an issue that matches GatewayHealer pattern
    gateway_issue = Issue(
        severity=Severity.P0,
        category=Category.INFRASTRUCTURE,
        system="gateway",
        message="Gateway not responding",
        can_auto_fix=True,
        metadata={}
    )
    
    # Create an issue that matches DiskHealer pattern
    disk_issue = Issue(
        severity=Severity.P2,
        category=Category.INFRASTRUCTURE,
        system="disk",
        message="Disk usage at 87%",
        can_auto_fix=True,
        metadata={"usage_percent": 87}
    )
    
    # Test healer routing
    print("\n1. HEALER ROUTING")
    print("-" * 40)
    
    gateway_healer = GatewayHealer()
    disk_healer = DiskHealer()
    
    # Gateway healer should handle gateway issues
    can_heal_gw = await gateway_healer.can_heal_issue(gateway_issue)
    print(f"GatewayHealer + gateway issue: {can_heal_gw} ✅")
    assert can_heal_gw, "Gateway healer should handle gateway issues"
    
    # But not disk issues
    cannot_heal_disk = await gateway_healer.can_heal_issue(disk_issue)
    print(f"GatewayHealer + disk issue: {not cannot_heal_disk} ✅")
    assert not cannot_heal_disk, "Gateway healer should NOT handle disk issues"
    
    # Disk healer should handle disk issues
    can_heal_disk = await disk_healer.can_heal_issue(disk_issue)
    print(f"DiskHealer + disk issue: {can_heal_disk} ✅")
    assert can_heal_disk, "Disk healer should handle disk issues"
    
    # But not gateway issues
    cannot_heal_gw = await disk_healer.can_heal_issue(gateway_issue)
    print(f"DiskHealer + gateway issue: {not cannot_heal_gw} ✅")
    assert not cannot_heal_gw, "Disk healer should NOT handle gateway issues"
    
    # Test alerter severity routing
    print("\n2. ALERTER SEVERITY ROUTING")
    print("-" * 40)
    
    alerter = DiscordAlerter()
    
    # P0 should alert immediately
    p0_should_alert = await alerter.should_alert(gateway_issue)
    print(f"P0 issue should alert: {p0_should_alert} ✅")
    assert p0_should_alert, "P0 issues should alert"
    
    # P2 should batch (check it gets added to batch)
    # Note: send_alert() handles batching, not should_alert()
    p2_should_alert = await alerter.should_alert(disk_issue)
    print(f"P2 issue should alert: {p2_should_alert} ✅")
    
    print("\n" + "=" * 60)
    print("✅ COMPONENT INTERACTION TEST PASSED")
    print("=" * 60)


async def main():
    """Run all integration tests"""
    try:
        await test_full_workflow()
        await test_component_interactions()
        
        print("\n" + "=" * 60)
        print("🎉 ALL INTEGRATION TESTS PASSED")
        print("=" * 60)
        print("\nSystem is ready for Day 6 (Main Loop)!")
        
    except AssertionError as e:
        print(f"\n❌ INTEGRATION TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    asyncio.run(main())
