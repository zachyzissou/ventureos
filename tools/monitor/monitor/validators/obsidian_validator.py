"""
Obsidian Sync Validator
Phase Zero Day 3: Data Validators

Validates Obsidian vault sync status and fact extraction.
"""

import time
import json
from pathlib import Path
from typing import Optional

from monitor.validator import BaseValidator
from monitor.models import Issue, Severity, Category


class ObsidianValidator(BaseValidator):
    """Validates Obsidian sync and extraction"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.workspace = Path(config.get("paths", {}).get("workspace", "/Users/zachgonser/clawd"))
        self.heartbeat_state = self.workspace / "memory" / "heartbeat-state.json"
        self.obsidian_vault = Path.home() / "Obsidian" / "VaultZap"
    
    async def validate(self, data: any = None) -> Optional[Issue]:
        """Validate Obsidian sync status"""
        
        # Check if Obsidian vault exists
        if not self.obsidian_vault.exists():
            return Issue(
                severity=Severity.P2,
                category=Category.DATA_INTEGRITY,
                system="obsidian",
                message=f"Obsidian vault not found: {self.obsidian_vault}",
                can_auto_fix=False,
                metadata={"vault_path": str(self.obsidian_vault)}
            )
        
        # Check last extraction time from heartbeat state
        if not self.heartbeat_state.exists():
            return Issue(
                severity=Severity.P3,
                category=Category.DATA_INTEGRITY,
                system="obsidian",
                message="Heartbeat state file missing (can't check extraction time)",
                can_auto_fix=True,
                metadata={
                    "file": str(self.heartbeat_state),
                    "action": "create_state_file"
                }
            )
        
        try:
            with open(self.heartbeat_state, 'r') as f:
                state = json.load(f)
            
            last_checks = state.get("lastChecks", {})
            last_extraction = last_checks.get("extraction")
            
            if last_extraction is None:
                # No extraction timestamp - might be first run
                return Issue(
                    severity=Severity.P3,
                    category=Category.DATA_INTEGRITY,
                    system="obsidian",
                    message="No extraction timestamp found in heartbeat state",
                    can_auto_fix=False,
                    metadata={"suggestion": "Run extraction manually or wait for next heartbeat"}
                )
            
            # Check how long since last extraction
            time_since = time.time() - last_extraction
            hours_since = time_since / 3600
            max_gap_hours = self.get_threshold("max_extraction_gap_hours", 4)
            
            if hours_since > max_gap_hours:
                return Issue(
                    severity=Severity.P2,
                    category=Category.DATA_INTEGRITY,
                    system="obsidian",
                    message=f"Fact extraction is stale ({hours_since:.1f}h since last extraction)",
                    can_auto_fix=True,
                    metadata={
                        "hours_since_extraction": hours_since,
                        "max_gap_hours": max_gap_hours,
                        "last_extraction_timestamp": last_extraction,
                        "action": "trigger_extraction"
                    }
                )
            
            # Extraction is recent - all good
            return None
            
        except json.JSONDecodeError as e:
            return Issue(
                severity=Severity.P2,
                category=Category.DATA_INTEGRITY,
                system="obsidian",
                message=f"Heartbeat state JSON is corrupted: {str(e)}",
                can_auto_fix=True,
                metadata={
                    "file": str(self.heartbeat_state),
                    "error": str(e),
                    "action": "restore_from_backup"
                }
            )
        
        except Exception as e:
            return Issue(
                severity=Severity.P2,
                category=Category.DATA_INTEGRITY,
                system="obsidian",
                message=f"Obsidian validation failed: {str(e)}",
                can_auto_fix=False,
                metadata={
                    "error": str(e),
                    "type": type(e).__name__
                }
            )
