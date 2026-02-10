#!/usr/bin/env python3
"""
One-time script to re-evaluate the 41 pending stories against the new approval tiers.
Reports how many would auto-approve, go to digest, or drop.
"""
import json
from pathlib import Path
from collections import Counter
from src.scoring.approval_tiers import ApprovalTierManager


def load_state():
    """Load the current state.json file."""
    state_path = Path(__file__).parent / "data" / "state.json"
    with open(state_path, 'r') as f:
        return json.load(f)


def categorize_backlog():
    """Analyze and categorize the pending stories."""
    state = load_state()
    
    # Get auto_approve config
    auto_approve_config = state.get("content_intelligence", {}).get("auto_approve", {})
    tier_manager = ApprovalTierManager(auto_approve_config)
    
    # Get pending stories
    pending_stories = state.get("pending_stories", [])
    
    print(f"\n{'='*80}")
    print(f"STANTTONTIMES BACKLOG CATEGORIZATION")
    print(f"{'='*80}\n")
    print(f"Total pending stories: {len(pending_stories)}")
    print(f"Auto-approve enabled: {tier_manager.enabled}")
    print(f"Official threshold: {tier_manager.official_threshold}")
    print(f"Trusted threshold: {tier_manager.trusted_threshold}")
    print(f"\n{'='*80}\n")
    
    # Categorize each story
    tier_counts = Counter()
    tier_stories = {
        "auto_approve": [],
        "batch_digest": [],
        "auto_drop": []
    }
    source_stats = Counter()
    
    for story in pending_stories:
        source = story.get("source", "Unknown")
        score = story.get("content_score", 0.0)
        topic = story.get("topic", "")
        
        # Create a minimal content dict for tier determination
        content = {
            "source": source,
            "priority": story.get("priority"),
            "tier": story.get("tier")
        }
        
        tier, reason = tier_manager.determine_tier(content, score)
        tier_counts[tier] += 1
        source_stats[source] += 1
        
        tier_stories[tier].append({
            "story_id": story.get("story_id"),
            "topic": topic[:60] + "..." if len(topic) > 60 else topic,
            "source": source,
            "score": score,
            "reason": reason
        })
    
    # Print summary by tier
    print("TIER SUMMARY:")
    print(f"  • Auto-approve (Tier 1): {tier_counts['auto_approve']} stories")
    print(f"  • Batch digest (Tier 2): {tier_counts['batch_digest']} stories")
    print(f"  • Auto-drop (Tier 3):    {tier_counts['auto_drop']} stories")
    print(f"\n{'='*80}\n")
    
    # Print source breakdown
    print("SOURCE BREAKDOWN:")
    for source, count in source_stats.most_common():
        print(f"  • {source}: {count} stories")
    print(f"\n{'='*80}\n")
    
    # Print detailed breakdown by tier
    for tier in ["auto_approve", "batch_digest", "auto_drop"]:
        stories = tier_stories[tier]
        if not stories:
            continue
            
        tier_label = tier.replace("_", " ").title()
        print(f"{tier_label.upper()} ({len(stories)} stories):")
        print(f"{'-'*80}")
        
        for i, story in enumerate(stories, 1):
            print(f"{i}. [{story['source']}] (score: {story['score']:.3f})")
            print(f"   {story['topic']}")
            print(f"   → {story['reason']}")
            print()
        
        print(f"{'='*80}\n")
    
    # Summary recommendations
    print("RECOMMENDATIONS:")
    print(f"  1. {tier_counts['auto_approve']} stories would be auto-approved")
    print(f"     These can be posted immediately without manual review.")
    print()
    print(f"  2. {tier_counts['batch_digest']} stories need manual review")
    print(f"     These should be collected into a daily digest message.")
    print()
    print(f"  3. {tier_counts['auto_drop']} stories would be dropped")
    print(f"     These are below threshold or duplicates.")
    print()
    print(f"  • Current backlog of {len(pending_stories)} stories")
    print(f"    would reduce to ~{tier_counts['batch_digest']} pending manual reviews")
    print(f"    (~{100 * tier_counts['auto_approve'] / len(pending_stories):.1f}% auto-approved)")
    print(f"\n{'='*80}\n")


if __name__ == "__main__":
    categorize_backlog()
