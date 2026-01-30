#!/usr/bin/env python3
"""
Test suite for main_loop orchestration
"""

import asyncio
from monitor.main_loop import MonitorAgent
from monitor.models import Issue, Severity, Category


async def test_initialization():
    """Test that MonitorAgent initializes all components"""
    print("\n=== Testing MonitorAgent Initialization ===")
    
    config = {
        "database": {"path": "data/test_monitor.db"},
        "healing": {"enabled": True, "max_attempts": 3, "cooldown_seconds": 300},
        "alerting": {
            "enabled": True,
            "discord": {"webhook_url": "https://test", "mention_user_id": "123"}
        }
    }
    
    agent = MonitorAgent(config)
    
    # Check components initialized
    assert len(agent.detectors) == 4, f"Expected 4 detectors, got {len(agent.detectors)}"
    print(f"✅ Detectors initialized: {list(agent.detectors.keys())}")
    
    assert len(agent.validators) == 4, f"Expected 4 validators, got {len(agent.validators)}"
    print(f"✅ Validators initialized: {list(agent.validators.keys())}")
    
    assert len(agent.healers) == 4, f"Expected 4 healers, got {len(agent.healers)}"
    print(f"✅ Healers initialized: {list(agent.healers.keys())}")
    
    assert agent.alerter is not None, "Alerter should be initialized"
    print(f"✅ Alerter initialized: {type(agent.alerter).__name__}")
    
    print("✅ All components initialized correctly")


async def test_issue_routing():
    """Test that issues route to correct healers"""
    print("\n=== Testing Issue Routing ===")
    
    config = {
        "database": {"path": "data/test_monitor.db"},
        "healing": {"enabled": True},
        "alerting": {"enabled": True, "discord": {"webhook_url": "https://test"}}
    }
    
    agent = MonitorAgent(config)
    
    # Create different types of issues
    gateway_issue = Issue(
        severity=Severity.P0,
        category=Category.INFRASTRUCTURE,
        system="gateway",
        message="Test gateway issue",
        can_auto_fix=True,
        metadata={}
    )
    
    disk_issue = Issue(
        severity=Severity.P2,
        category=Category.INFRASTRUCTURE,
        system="disk",
        message="Test disk issue",
        can_auto_fix=True,
        metadata={}
    )
    
    git_issue = Issue(
        severity=Severity.P3,
        category=Category.DATA_INTEGRITY,
        system="git",
        message="Test git issue",
        can_auto_fix=True,
        metadata={}
    )
    
    # Test routing
    gateway_healer_found = False
    disk_healer_found = False
    git_healer_found = False
    
    for healer_name, healer in agent.healers.items():
        if await healer.can_heal_issue(gateway_issue):
            gateway_healer_found = True
            assert healer_name == "gateway", f"Gateway issue should route to gateway healer, not {healer_name}"
        
        if await healer.can_heal_issue(disk_issue):
            disk_healer_found = True
            assert healer_name == "disk", f"Disk issue should route to disk healer, not {healer_name}"
        
        if await healer.can_heal_issue(git_issue):
            git_healer_found = True
            assert healer_name == "git", f"Git issue should route to git healer, not {healer_name}"
    
    assert gateway_healer_found, "Gateway issue should find healer"
    print("✅ Gateway issue routes to gateway healer")
    
    assert disk_healer_found, "Disk issue should find healer"
    print("✅ Disk issue routes to disk healer")
    
    assert git_healer_found, "Git issue should find healer"
    print("✅ Git issue routes to git healer")
    
    print("✅ All issues route correctly")


async def test_run_checks():
    """Test that run_all_checks executes without errors"""
    print("\n=== Testing Check Execution ===")
    
    config = {
        "database": {"path": "data/test_monitor.db"},
        "healing": {"enabled": True},
        "alerting": {"enabled": True, "discord": {"webhook_url": "https://test"}}
    }
    
    agent = MonitorAgent(config)
    
    # Run one cycle of checks
    try:
        issues = await agent._run_all_checks()
        print(f"✅ Check cycle completed, found {len(issues)} issues")
        
        # Should not crash, might find real issues or not
        assert isinstance(issues, list), "Should return a list"
        print("✅ Return type correct")
        
        # All items should be Issue objects
        for issue in issues:
            assert isinstance(issue, Issue), f"Expected Issue, got {type(issue)}"
        print(f"✅ All {len(issues)} items are Issue objects")
        
    except Exception as e:
        print(f"❌ Check execution failed: {e}")
        raise


async def test_graceful_stop():
    """Test that agent can be stopped gracefully"""
    print("\n=== Testing Graceful Stop ===")
    
    config = {
        "database": {"path": "data/test_monitor.db"},
        "healing": {"enabled": True},
        "alerting": {"enabled": True, "discord": {"webhook_url": "https://test"}}
    }
    
    agent = MonitorAgent(config)
    
    # Start in background
    agent.running = True
    print("✅ Agent marked as running")
    
    # Stop it
    agent.stop()
    assert not agent.running, "Agent should be stopped"
    print("✅ Agent stopped gracefully")


async def main():
    """Run all main loop tests"""
    print("=" * 60)
    print("MAIN LOOP TEST SUITE")
    print("=" * 60)
    
    try:
        await test_initialization()
        await test_issue_routing()
        await test_run_checks()
        await test_graceful_stop()
        
        print("\n" + "=" * 60)
        print("✅ ALL MAIN LOOP TESTS PASSED")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    asyncio.run(main())
