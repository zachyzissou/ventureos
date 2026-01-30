#!/usr/bin/env python3
"""
Discord Alerter - Send alerts via Discord webhooks
"""

import asyncio
from typing import Optional
from monitor.models import Issue, HealResult, Severity
from monitor.alerter import BaseAlerter
from monitor.http_client import HTTPClientManager
import logging

logger = logging.getLogger(__name__)


class DiscordAlerter(BaseAlerter):
    """Send alerts via Discord webhook with rich embeds"""
    
    # Severity color mapping (Discord embed colors)
    SEVERITY_COLORS = {
        Severity.P0: 0xFF0000,  # Red - Critical
        Severity.P1: 0xFF6600,  # Orange - High  
        Severity.P2: 0xFFCC00,  # Yellow - Medium
        Severity.P3: 0x00CC00,  # Green - Low
    }
    
    def __init__(self, config: dict = None):
        if config is None:
            config = {
                "alerting": {
                    "enabled": True,
                    "discord": {
                        "webhook_url": "",
                        "mention_user_id": "956203522624462918"
                    },
                    "deduplication_window_seconds": 300,
                    "batch_interval_seconds": 900
                }
            }
        super().__init__(config)
        
        discord_config = self.alerting_config.get("discord", {})
        self.webhook_url = discord_config.get("webhook_url", "")
        self.mention_user_id = discord_config.get("mention_user_id", "")
        
        if not self.webhook_url:
            logger.warning("Discord webhook URL not configured")
    
    async def send_alert(self, issue: Issue, escalation: bool = False) -> bool:
        """Send alert to Discord"""
        logger.info("attempting_discord_alert",
                   issue_id=issue.id,
                   severity=issue.severity.value,
                   escalation=escalation)
        
        try:
            # Check if we should alert (dedup)
            if not escalation and not await self.should_alert(issue):
                return False
            
            # P2/P3 get batched, not immediate
            if issue.severity in [Severity.P2, Severity.P3] and not escalation:
                await self.add_to_batch(issue)
                return True
            
            # Build embed
            embed = self._build_issue_embed(issue, escalation)
            
            # Build message content (mentions for P0)
            content = ""
            if issue.severity == Severity.P0 and self.mention_user_id:
                content = f"<@{self.mention_user_id}> 🚨 CRITICAL ALERT"
            
            payload = {
                "content": content,
                "embeds": [embed]
            }
            
            # Send via webhook
            async with HTTPClientManager() as client:
                response = await client.post(self.webhook_url, json=payload)
                
                if response.status_code in [200, 204]:
                    logger.info("discord_alert_sent",
                               issue_id=issue.id,
                               severity=issue.severity.value)
                    await self.record_alert(issue)
                    return True
                else:
                    logger.error("discord_alert_failed",
                               issue_id=issue.id,
                               status_code=response.status_code,
                               response=response.text[:500])
                    return False
                    
        except Exception as e:
            logger.error("discord_alert_exception",
                        issue_id=issue.id,
                        error=str(e))
            return False
    
    async def send_heal_result(self, issue: Issue, result: HealResult) -> bool:
        """Send heal result notification to Discord"""
        logger.info("attempting_heal_result_notification",
                   issue_id=issue.id,
                   success=result.success)
        
        try:
            # Build embed
            embed = self._build_heal_result_embed(issue, result)
            
            payload = {"embeds": [embed]}
            
            # Send via webhook
            async with HTTPClientManager() as client:
                response = await client.post(self.webhook_url, json=payload)
                
                if response.status_code in [200, 204]:
                    logger.info("heal_result_sent", issue_id=issue.id)
                    return True
                else:
                    logger.error("heal_result_failed",
                               issue_id=issue.id,
                               status_code=response.status_code)
                    return False
                    
        except Exception as e:
            logger.error("heal_result_exception",
                        issue_id=issue.id,
                        error=str(e))
            return False
    
    async def send_batch_digest(self, issues: list[Issue]) -> bool:
        """Send batched alerts as a digest"""
        if not issues:
            return True
        
        logger.info("sending_batch_digest", issue_count=len(issues))
        
        try:
            # Build digest embed
            embed = {
                "title": f"📊 Monitor Digest ({len(issues)} issues)",
                "color": self.SEVERITY_COLORS[Severity.P2],
                "fields": [],
                "footer": {"text": "Monitor-Agent Batch Digest"}
            }
            
            # Group by category
            by_category = {}
            for issue in issues:
                cat = issue.category.value
                if cat not in by_category:
                    by_category[cat] = []
                by_category[cat].append(issue)
            
            # Add fields per category
            for category, cat_issues in by_category.items():
                lines = []
                for issue in cat_issues[:5]:  # Limit to 5 per category
                    emoji = "🔴" if issue.severity == Severity.P2 else "🟢"
                    lines.append(f"{emoji} {issue.system}: {issue.message[:100]}")
                
                if len(cat_issues) > 5:
                    lines.append(f"... and {len(cat_issues) - 5} more")
                
                embed["fields"].append({
                    "name": f"**{category.title()}**",
                    "value": "\n".join(lines),
                    "inline": False
                })
            
            payload = {"embeds": [embed]}
            
            # Send via webhook
            async with HTTPClientManager() as client:
                response = await client.post(self.webhook_url, json=payload)
                
                if response.status_code in [200, 204]:
                    logger.info("batch_digest_sent", issue_count=len(issues))
                    return True
                else:
                    logger.error("batch_digest_failed",
                               status_code=response.status_code)
                    return False
                    
        except Exception as e:
            logger.error("batch_digest_exception", error=str(e))
            return False
    
    def _build_issue_embed(self, issue: Issue, escalation: bool = False) -> dict:
        """Build Discord embed for an issue"""
        color = self.SEVERITY_COLORS.get(issue.severity, 0x808080)
        
        # Emoji by severity
        emoji_map = {
            Severity.P0: "🚨",
            Severity.P1: "⚠️",
            Severity.P2: "⚡",
            Severity.P3: "ℹ️"
        }
        emoji = emoji_map.get(issue.severity, "❓")
        
        title = f"{emoji} [{issue.severity.value}] {issue.category.value.title()}"
        if escalation:
            title += " (ESCALATED)"
        
        embed = {
            "title": title,
            "description": f"**{issue.system}:** {issue.message}",
            "color": color,
            "fields": [
                {
                    "name": "Issue ID",
                    "value": f"`{issue.id[:8]}`",
                    "inline": True
                },
                {
                    "name": "Auto-fixable",
                    "value": "✅ Yes" if issue.can_auto_fix else "❌ No",
                    "inline": True
                }
            ],
            "footer": {"text": f"Monitor-Agent · {issue.detected_at}"},
        }
        
        # Add metadata if present
        if issue.metadata:
            metadata_str = "\n".join([f"• {k}: {v}" for k, v in list(issue.metadata.items())[:5]])
            embed["fields"].append({
                "name": "Details",
                "value": metadata_str,
                "inline": False
            })
        
        return embed
    
    def _build_heal_result_embed(self, issue: Issue, result: HealResult) -> dict:
        """Build Discord embed for heal result"""
        color = 0x00CC00 if result.success else 0xFF6600  # Green or orange
        emoji = "✅" if result.success else "❌"
        
        embed = {
            "title": f"{emoji} Self-Healing {('Succeeded' if result.success else 'Failed')}",
            "description": result.message,
            "color": color,
            "fields": [
                {
                    "name": "Issue",
                    "value": f"{issue.system}: {issue.message[:100]}",
                    "inline": False
                },
                {
                    "name": "Action Taken",
                    "value": result.action_taken,
                    "inline": True
                }
            ],
            "footer": {"text": f"Monitor-Agent · {result.timestamp}"},
        }
        
        # Add metadata if present
        if result.metadata:
            metadata_str = "\n".join([f"• {k}: {v}" for k, v in list(result.metadata.items())[:3]])
            embed["fields"].append({
                "name": "Details",
                "value": metadata_str,
                "inline": False
            })
        
        return embed
