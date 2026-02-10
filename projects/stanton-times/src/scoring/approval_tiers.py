"""
Approval tier logic for StantonTimes content pipeline.
Determines whether content should be auto-approved, batched, or dropped.
"""
from typing import Dict, Any, Literal, Tuple


ApprovalTier = Literal["auto_approve", "batch_digest", "auto_drop"]


class ApprovalTierManager:
    """Manages approval tier decisions for drafted content."""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize with configuration from state.json content_intelligence block.
        
        Args:
            config: The auto_approve configuration dictionary
        """
        self.enabled = config.get("enabled", False)
        self.official_sources = set(config.get("official_sources", []))
        self.official_threshold = float(config.get("official_threshold", 0.75))
        self.trusted_sources = set(config.get("trusted_sources", []))
        self.trusted_threshold = float(config.get("trusted_threshold", 0.82))
        self.batch_digest = config.get("batch_digest", True)
        
    def determine_tier(
        self, 
        content: Dict[str, Any], 
        score: float
    ) -> Tuple[ApprovalTier, str]:
        """
        Determine the approval tier for a piece of content.
        
        Args:
            content: Content dictionary with source, priority, etc.
            score: Calculated content score
            
        Returns:
            Tuple of (tier, reason) where tier is the approval decision
            and reason is a human-readable explanation
        """
        if not self.enabled:
            return ("batch_digest", "auto-approve disabled")
        
        source = content.get("source", "")
        priority = (content.get("priority") or "").upper()
        
        # P0 priority always auto-approves if above official threshold
        # (P0 should already bypass thresholds in scoring, but double-check here)
        if priority == "P0" and score >= self.official_threshold:
            return ("auto_approve", f"P0 priority with score {score:.3f}")
        
        # Tier 1: Official RSI sources
        if source in self.official_sources:
            if score >= self.official_threshold:
                return ("auto_approve", f"official source '{source}' with score {score:.3f} >= {self.official_threshold}")
            else:
                return ("batch_digest", f"official source '{source}' below threshold ({score:.3f} < {self.official_threshold})")
        
        # Tier 1: Trusted YouTubers
        if source in self.trusted_sources:
            if score >= self.trusted_threshold:
                return ("auto_approve", f"trusted source '{source}' with score {score:.3f} >= {self.trusted_threshold}")
            else:
                return ("batch_digest", f"trusted source '{source}' below threshold ({score:.3f} < {self.trusted_threshold})")
        
        # Tier 2: Everything else above the draft threshold goes to batch
        # (If it got this far, it's already above the draft threshold)
        return ("batch_digest", f"source '{source}' with score {score:.3f}")
    
    def should_auto_approve(self, content: Dict[str, Any], score: float) -> bool:
        """
        Quick check if content should be auto-approved.
        
        Args:
            content: Content dictionary
            score: Calculated score
            
        Returns:
            True if content should skip manual review
        """
        tier, _ = self.determine_tier(content, score)
        return tier == "auto_approve"
