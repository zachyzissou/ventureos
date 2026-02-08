#!/usr/bin/env python3
"""
Test suite for alerter implementations
"""

import asyncio
from datetime import datetime
from monitor.models import Issue, HealResult, Severity, Category
from monitor.alerters import DiscordAlerter


async def test_discord_alerter_initialization():
    """Test DiscordAlerter can be initialized"""
    print("\n=== Testing DiscordAlerter Initialization ===")
    
    config = {
        "alerting": {
            "enabled": True,
            "discord": {
                "webhook_url": "https://discord.com/api/webhooks/test",
                "mention_user_id": "956203522624462918"
            },
            "deduplication_window_seconds": 300,
            "batch_interval_seconds": 900
        }
    }
    
    alerter = DiscordAlerter(config)
    
    print(f"Alerter enabled: {alerter.enabled} ✅")
    print(f"Webhook configured: {bool(alerter.webhook_url)} ✅")
    print(f"Dedup window: {alerter.dedup_window}s ✅")
    
    assert alerter.enabled, "Alerter should be enabled"
    assert alerter.webhook_url, "Webhook URL should be configured"


async def test_alert_deduplication():
    """Test that duplicate alerts are blocked"""
    print("\n=== Testing Alert Deduplication ===")
    
    config = {
        "alerting": {
            "enabled": True,
            "discord": {"webhook_url": "https://test", "mention_user_id": "123"},
            "deduplication_window_seconds": 5
        }
    }
    
    alerter = DiscordAlerter(config)
    
    # Create test issue
    issue = Issue(
        severity=Severity.P1,
        category=Category.INFRASTRUCTURE,
        system="test",
        message="Test alert",
        can_auto_fix=False,
        metadata={}
    )
    
    # First alert should be allowed
    should_alert_1 = await alerter.should_alert(issue)
    print(f"First alert allowed: {should_alert_1} ✅")
    assert should_alert_1, "First alert should be allowed"
    
    # Record the alert
    await alerter.record_alert(issue)
    
    # Immediate duplicate should be blocked
    should_alert_2 = await alerter.should_alert(issue)
    print(f"Duplicate alert blocked: {not should_alert_2} ✅")
    assert not should_alert_2, "Duplicate alert should be blocked"
    
    # Different issue should still be allowed
    other_issue = Issue(
        severity=Severity.P1,
        category=Category.INFRASTRUCTURE,
        system="test2",
        message="Different alert",
        can_auto_fix=False,
        metadata={}
    )
    
    should_alert_3 = await alerter.should_alert(other_issue)
    print(f"Different alert allowed: {should_alert_3} ✅")
    assert should_alert_3, "Different alert should be allowed"


async def test_severity_routing():
    """Test that P2/P3 alerts get batched"""
    print("\n=== Testing Severity Routing ===")
    
    config = {
        "alerting": {
            "enabled": True,
            "discord": {"webhook_url": "https://test", "mention_user_id": "123"}
        }
    }
    
    alerter = DiscordAlerter(config)
    
    # P2 issue should be batched
    p2_issue = Issue(
        severity=Severity.P2,
        category=Category.INFRASTRUCTURE,
        system="test",
        message="P2 alert",
        can_auto_fix=False,
        metadata={}
    )
    
    await alerter.add_to_batch(p2_issue)
    
    batched = await alerter.get_batched_alerts()
    print(f"P2 alert batched: {len(batched) > 0} ✅")
    assert len(batched) > 0, "P2 alert should be in batch"
    
    # Batch should be cleared after getting
    batched_again = await alerter.get_batched_alerts()
    print(f"Batch cleared after retrieval: {len(batched_again) == 0} ✅")
    assert len(batched_again) == 0, "Batch should be empty after retrieval"


async def test_embed_building():
    """Test that embeds are built correctly"""
    print("\n=== Testing Embed Building ===")
    
    alerter = DiscordAlerter()
    
    # Test issue embed
    issue = Issue(
        severity=Severity.P0,
        category=Category.INFRASTRUCTURE,
        system="gateway",
        message="Gateway crashed",
        can_auto_fix=True,
        metadata={"restart_attempts": 1}
    )
    
    embed = alerter._build_issue_embed(issue, escalation=False)
    
    print(f"Embed has title: {bool(embed.get('title'))} ✅")
    print(f"Embed has color: {bool(embed.get('color'))} ✅")
    print(f"Embed has fields: {len(embed.get('fields', []))} ✅")
    
    assert embed.get('title'), "Embed should have title"
    assert embed.get('color') == DiscordAlerter.SEVERITY_COLORS[Severity.P0], "P0 should be red"
    assert len(embed.get('fields', [])) >= 2, "Embed should have at least 2 fields"
    
    # Test heal result embed
    result = HealResult(
        success=True,
        message="Gateway restarted successfully",
        action_taken="restart_gateway",
        metadata={}
    )
    
    heal_embed = alerter._build_heal_result_embed(issue, result)
    
    print(f"Heal embed has title: {bool(heal_embed.get('title'))} ✅")
    print(f"Heal embed is green (success): {heal_embed.get('color') == 0x00CC00} ✅")
    
    assert heal_embed.get('title'), "Heal embed should have title"
    assert heal_embed.get('color') == 0x00CC00, "Success should be green"


async def test_cleanup_old_alerts():
    """Test that old alert records are cleaned up"""
    print("\n=== Testing Alert Cleanup ===")
    
    alerter = DiscordAlerter()
    
    # Add some alerts
    issue1 = Issue(
        severity=Severity.P1,
        category=Category.INFRASTRUCTURE,
        system="test1",
        message="Test 1",
        can_auto_fix=False,
        metadata={}
    )
    
    issue2 = Issue(
        severity=Severity.P1,
        category=Category.INFRASTRUCTURE,
        system="test2",
        message="Test 2",
        can_auto_fix=False,
        metadata={}
    )
    
    await alerter.record_alert(issue1)
    await alerter.record_alert(issue2)
    
    print(f"Recorded 2 alerts ✅")
    
    # Manually set one as very old
    alert_key = f"{issue1.category.value}:{issue1.system}:{issue1.message[:100]}"
    async with alerter._alert_lock:
        alerter._recent_alerts[alert_key] = 1000  # Very old timestamp
    
    # Cleanup with max age of 3600 seconds
    await alerter.cleanup_old_alerts(max_age_seconds=3600)
    
    # Check that old one was removed
    async with alerter._alert_lock:
        remaining = len(alerter._recent_alerts)
    
    print(f"Old alerts cleaned up: {remaining < 2} ✅")
    # At least the very old one should be gone
    assert remaining < 2, "Old alert should have been cleaned up"


async def main():
    """Run all alerter tests"""
    print("=" * 60)
    print("ALERTER TEST SUITE")
    print("=" * 60)
    
    try:
        await test_discord_alerter_initialization()
        await test_alert_deduplication()
        await test_severity_routing()
        await test_embed_building()
        await test_cleanup_old_alerts()
        
        print("\n" + "=" * 60)
        print("✅ ALL ALERTER TESTS PASSED")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
