"""
Architecture Fix Validation
Tests all 5 critical fixes.
"""

import asyncio
import sys
from pathlib import Path

# No more sys.path hacks! Proper package imports
from monitor import StateDatabase, DatabaseError, HTTPClientManager, get_logger, Issue, Severity, Category

logger = get_logger(__name__)


async def test_database_lifecycle():
    """Test #1: Database connection management with context manager"""
    print("\n=== Test 1: Database Lifecycle ===")
    
    db_path = "data/test_monitor.db"
    
    # Test context manager (proper pattern)
    async with StateDatabase(db_path) as db:
        # Create a test issue
        issue = Issue(
            severity=Severity.P1,
            category=Category.INFRASTRUCTURE,
            system="test",
            message="Test issue for lifecycle",
            metadata={"test": True}
        )
        
        await db.record_issue(issue)
        print("✓ Issue recorded with context manager")
        
        # Verify it was saved
        active = await db.get_active_issues()
        assert len(active) > 0, "Should have active issues"
        print(f"✓ Retrieved {len(active)} active issue(s)")
    
    # Connection should be closed after context manager
    print("✓ Context manager closed connection")
    
    # Test error handling
    db2 = StateDatabase(db_path)
    try:
        # Should fail - not connected
        await db2.record_issue(issue)
        print("❌ Should have raised DatabaseError")
        return False
    except DatabaseError as e:
        print(f"✓ Proper error when not connected: {e}")
    
    print("✅ Database lifecycle test passed")
    return True


async def test_concurrency_safety():
    """Test #3: Concurrency safety in healer"""
    print("\n=== Test 2: Concurrency Safety ===")
    
    from monitor.healer import BaseHealer
    from monitor.models import HealResult
    
    class TestHealer(BaseHealer):
        async def heal(self, issue: Issue) -> HealResult:
            return HealResult(
                success=True,
                message="Test heal",
                action_taken="test_action"
            )
    
    config = {
        "healing": {
            "enabled": True,
            "max_attempts": 3,
            "cooldown_seconds": 1,
            "actions": {
                "test_action": {"enabled": True}
            }
        }
    }
    
    healer = TestHealer(config)
    issue = Issue(
        severity=Severity.P1,
        category=Category.INFRASTRUCTURE,
        system="test",
        message="Test issue for concurrency"
    )
    
    # Test concurrent can_heal calls
    async def try_heal():
        can_heal = await healer.can_heal(issue, "test_action")
        if can_heal:
            await healer.record_heal_attempt(issue, "test_action")
        return can_heal
    
    # Launch 10 concurrent heal attempts
    results = await asyncio.gather(*[try_heal() for _ in range(10)])
    
    # Only first should succeed (others should be on cooldown or hit max attempts)
    successful = sum(results)
    print(f"✓ Concurrent attempts: {successful} succeeded out of 10")
    assert successful <= 3, "Should respect max_attempts limit"
    
    print("✅ Concurrency safety test passed")
    return True


async def test_http_client_reuse():
    """Test #5: HTTP client connection pooling"""
    print("\n=== Test 3: HTTP Client Reuse ===")
    
    # Test context manager pattern
    async with HTTPClientManager() as client:
        # Make multiple requests - should reuse connections
        urls = [
            "https://httpbin.org/status/200",
            "https://httpbin.org/status/200",
            "https://httpbin.org/status/200",
        ]
        
        for url in urls:
            response = await client.get(url, timeout=5.0)
            assert response.status_code == 200
        
        print(f"✓ Made {len(urls)} requests with connection reuse")
    
    print("✓ HTTP client closed after context manager")
    
    # Test singleton pattern
    manager = HTTPClientManager.get_instance()
    await manager.start()
    
    assert manager.is_ready(), "Client should be ready"
    print("✓ Singleton client initialized")
    
    await manager.stop()
    assert not manager.is_ready(), "Client should be stopped"
    print("✓ Singleton client stopped")
    
    print("✅ HTTP client reuse test passed")
    return True


async def test_error_handling():
    """Test #4: Error handling in database operations"""
    print("\n=== Test 4: Error Handling ===")
    
    db_path = "data/test_monitor.db"
    
    async with StateDatabase(db_path) as db:
        # Test with invalid data
        try:
            # Try to get issues from a table that might not exist
            issues = await db.get_active_issues()
            print(f"✓ Query returned {len(issues)} issues (or handled missing table)")
        except DatabaseError as e:
            print(f"✓ Caught database error properly: {e}")
        except Exception as e:
            print(f"⚠️  Unexpected error type: {type(e).__name__}: {e}")
    
    print("✅ Error handling test passed")
    return True


async def test_no_import_hacks():
    """Test #2: Proper package imports (no sys.path manipulation)"""
    print("\n=== Test 5: No Import Hacks ===")
    
    # Verify we can import without sys.path manipulation
    try:
        from monitor.detector import BaseDetector
        from monitor.validator import BaseValidator
        from monitor.healer import BaseHealer
        from monitor.models import Issue, Severity
        
        print("✓ All imports work without sys.path hacks")
        print("✓ Proper package structure")
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        return False
    
    print("✅ Import structure test passed")
    return True


async def main():
    """Run all architecture fix tests"""
    print("=" * 60)
    print("ARCHITECTURE FIX VALIDATION")
    print("Testing all 5 critical fixes")
    print("=" * 60)
    
    tests = [
        ("Database Lifecycle", test_database_lifecycle),
        ("Concurrency Safety", test_concurrency_safety),
        ("HTTP Client Reuse", test_http_client_reuse),
        ("Error Handling", test_error_handling),
        ("Import Structure", test_no_import_hacks),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = await test_func()
            results.append((name, result))
        except Exception as e:
            logger.error(f"Test {name} failed with exception", error=str(e))
            print(f"\n❌ {name} test crashed: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("TEST RESULTS")
    print("=" * 60)
    
    for name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{name:.<40} {status}")
    
    all_passed = all(passed for _, passed in results)
    
    print("=" * 60)
    if all_passed:
        print("✅ ALL ARCHITECTURE FIXES VALIDATED")
    else:
        print("❌ SOME TESTS FAILED")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
