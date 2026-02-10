#!/usr/bin/env python3
"""
Quick test to verify the approval tier integration works correctly.
"""
import json
from pathlib import Path
from src.scoring.approval_tiers import ApprovalTierManager


def test_approval_tiers():
    """Test the approval tier logic with sample content."""
    # Load config from state.json
    state_path = Path(__file__).parent / "data" / "state.json"
    with open(state_path, 'r') as f:
        state = json.load(f)
    
    auto_approve_config = state.get("content_intelligence", {}).get("auto_approve", {})
    tier_manager = ApprovalTierManager(auto_approve_config)
    
    print(f"\n{'='*80}")
    print("APPROVAL TIER INTEGRATION TEST")
    print(f"{'='*80}\n")
    print(f"Configuration loaded:")
    print(f"  • Enabled: {tier_manager.enabled}")
    print(f"  • Official sources: {len(tier_manager.official_sources)}")
    print(f"  • Official threshold: {tier_manager.official_threshold}")
    print(f"  • Trusted sources: {len(tier_manager.trusted_sources)}")
    print(f"  • Trusted threshold: {tier_manager.trusted_threshold}")
    print(f"\n{'='*80}\n")
    
    # Test cases
    test_cases = [
        {
            "name": "Official RSI source above threshold",
            "content": {"source": "Star Citizen (YouTube)", "priority": "P0"},
            "score": 0.82,
            "expected_tier": "auto_approve"
        },
        {
            "name": "Official RSI source below threshold",
            "content": {"source": "Star Citizen (YouTube)", "priority": "P1"},
            "score": 0.70,
            "expected_tier": "batch_digest"
        },
        {
            "name": "Trusted YouTuber above threshold",
            "content": {"source": "BoredGamer (YouTube)", "priority": "P1"},
            "score": 0.85,
            "expected_tier": "auto_approve"
        },
        {
            "name": "Trusted YouTuber below threshold",
            "content": {"source": "BoredGamer (YouTube)", "priority": "P1"},
            "score": 0.74,
            "expected_tier": "batch_digest"
        },
        {
            "name": "Unknown source",
            "content": {"source": "Random Blog", "priority": "P1"},
            "score": 0.80,
            "expected_tier": "batch_digest"
        },
        {
            "name": "P0 priority with official source",
            "content": {"source": "RSI Comm-Link", "priority": "P0"},
            "score": 0.76,
            "expected_tier": "auto_approve"
        },
    ]
    
    print("Running test cases:\n")
    passed = 0
    failed = 0
    
    for i, test in enumerate(test_cases, 1):
        tier, reason = tier_manager.determine_tier(test["content"], test["score"])
        status = "✓ PASS" if tier == test["expected_tier"] else "✗ FAIL"
        
        if tier == test["expected_tier"]:
            passed += 1
        else:
            failed += 1
        
        print(f"{i}. {test['name']}")
        print(f"   Source: {test['content']['source']}, Score: {test['score']}")
        print(f"   Expected: {test['expected_tier']}, Got: {tier}")
        print(f"   Reason: {reason}")
        print(f"   {status}\n")
    
    print(f"{'='*80}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*80}\n")
    
    return failed == 0


if __name__ == "__main__":
    success = test_approval_tiers()
    exit(0 if success else 1)
