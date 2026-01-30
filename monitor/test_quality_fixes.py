"""
Test Quality Fixes
Validates the critical bug fixes work correctly.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from models import Issue, HealResult, HealthCheck, Metric, Severity, Category, Status


def test_metadata_serialization():
    """Test that metadata is properly JSON serialized"""
    print("\n=== Testing Metadata Serialization ===")
    
    # Create an Issue with complex metadata
    issue = Issue(
        severity=Severity.P1,
        category=Category.INFRASTRUCTURE,
        system="test",
        message="Test issue",
        metadata={"key": "value", "nested": {"foo": "bar"}, "list": [1, 2, 3]}
    )
    
    # Convert to dict
    issue_dict = issue.to_dict()
    
    # Check that metadata is JSON string
    metadata_str = issue_dict["metadata"]
    print(f"✓ Metadata type: {type(metadata_str)}")
    
    assert isinstance(metadata_str, str), "Metadata should be string"
    
    # Parse it back
    metadata_parsed = json.loads(metadata_str)
    print(f"✓ Parsed metadata: {metadata_parsed}")
    
    assert metadata_parsed == issue.metadata, "Metadata should round-trip correctly"
    assert metadata_parsed["key"] == "value", "Should preserve string values"
    assert metadata_parsed["nested"]["foo"] == "bar", "Should preserve nested dicts"
    assert metadata_parsed["list"] == [1, 2, 3], "Should preserve lists"
    
    print("✅ Metadata serialization works correctly")


def test_all_models():
    """Test all models serialize correctly"""
    print("\n=== Testing All Models ===")
    
    # Test Issue
    issue = Issue(
        severity=Severity.P0,
        category=Category.DATA_INTEGRITY,
        system="test",
        message="Test",
        metadata={"test": True}
    )
    assert isinstance(json.loads(issue.to_dict()["metadata"]), dict)
    print("✓ Issue model OK")
    
    # Test HealResult
    heal = HealResult(
        success=True,
        message="Fixed",
        action_taken="restart",
        metadata={"duration_ms": 100}
    )
    assert isinstance(json.loads(heal.to_dict()["metadata"]), dict)
    print("✓ HealResult model OK")
    
    # Test HealthCheck
    health = HealthCheck(
        category=Category.INFRASTRUCTURE,
        system="test",
        check_name="test_check",
        status=Status.OK,
        metadata={"uptime": 3600}
    )
    assert isinstance(json.loads(health.to_dict()["metadata"]), dict)
    print("✓ HealthCheck model OK")
    
    # Test Metric
    metric = Metric(
        metric_name="cpu_usage",
        value=45.5,
        unit="%",
        metadata={"host": "localhost"}
    )
    assert isinstance(json.loads(metric.to_dict()["metadata"]), dict)
    print("✓ Metric model OK")
    
    print("✅ All models serialize correctly")


def main():
    print("=" * 60)
    print("QUALITY FIX VALIDATION")
    print("=" * 60)
    
    try:
        test_metadata_serialization()
        test_all_models()
        
        print("\n" + "=" * 60)
        print("✅ All quality fixes validated")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ Validation failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
