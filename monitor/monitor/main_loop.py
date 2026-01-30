#!/usr/bin/env python3
"""
Monitor-Agent Main Loop
Phase Zero Day 6: Orchestration

Coordinates detectors, validators, healers, and alerters in continuous monitoring loop.
"""

import asyncio
import signal
import sys
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from monitor.models import Issue, HealResult, Severity, Category
from monitor.detectors import GatewayDetector, CronDetector, APIDetector, DiskDetector
from monitor.validators import MemoryValidator, StateValidator, ObsidianValidator, GitValidator
from monitor.healers import GatewayHealer, CronHealer, DiskHealer, GitHealer
from monitor.alerters import DiscordAlerter
from monitor.state_db import StateDatabase
from monitor.http_client import HTTPClientManager
from monitor.logging_config import get_logger

logger = get_logger(__name__)


class MonitorAgent:
    """
    Main orchestrator for the self-healing monitoring system.
    
    Continuously runs detectors and validators, attempts healing on issues,
    and sends alerts based on severity and heal results.
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.running = False
        self.db_path = config.get("database", {}).get("path", "data/monitor.db")
        
        # Initialize components
        self._init_detectors()
        self._init_validators()
        self._init_healers()
        self._init_alerters()
        
        logger.info("MonitorAgent initialized", config=config)
    
    def _init_detectors(self):
        """Initialize all detection modules"""
        self.detectors = {
            "gateway": GatewayDetector(self.config),
            "cron": CronDetector(self.config),
            "api": APIDetector(self.config, HTTPClientManager()),
            "disk": DiskDetector(self.config),
        }
        logger.info("Detectors initialized", count=len(self.detectors))
    
    def _init_validators(self):
        """Initialize all validation modules"""
        self.validators = {
            "memory": MemoryValidator(self.config),
            "state": StateValidator(self.config),
            "obsidian": ObsidianValidator(self.config),
            "git": GitValidator(self.config),
        }
        logger.info("Validators initialized", count=len(self.validators))
    
    def _init_healers(self):
        """Initialize all healing modules"""
        self.healers = {
            "gateway": GatewayHealer(self.config),
            "cron": CronHealer(self.config),
            "disk": DiskHealer(self.config),
            "git": GitHealer(self.config),
        }
        logger.info("Healers initialized", count=len(self.healers))
    
    def _init_alerters(self):
        """Initialize alerting system"""
        self.alerter = DiscordAlerter(self.config)
        logger.info("Alerter initialized")
    
    async def run(self):
        """
        Main monitoring loop.
        
        Continuously:
        1. Run all detectors and validators
        2. For each issue found, attempt healing if auto-fixable
        3. Send alerts based on severity and heal results
        4. Record all activity to database
        5. Sleep and repeat
        """
        self.running = True
        logger.info("MonitorAgent starting main loop")
        
        loop_count = 0
        
        while self.running:
            try:
                loop_count += 1
                loop_start = datetime.now()
                
                logger.debug("Starting monitoring cycle", loop=loop_count)
                
                # Run all checks
                issues = await self._run_all_checks()
                
                logger.info("Monitoring cycle complete", 
                           loop=loop_count,
                           issues_found=len(issues))
                
                # Process each issue
                for issue in issues:
                    await self._process_issue(issue)
                
                # Update dashboard (TODO: implement)
                # await self._update_dashboard()
                
                # Calculate sleep time (60s default)
                loop_duration = (datetime.now() - loop_start).total_seconds()
                sleep_time = max(1, 60 - loop_duration)
                
                logger.debug("Sleeping", seconds=sleep_time)
                await asyncio.sleep(sleep_time)
                
            except KeyboardInterrupt:
                logger.info("Received interrupt signal, shutting down")
                self.running = False
                break
            except Exception as e:
                logger.error("Error in main loop", error=str(e), loop=loop_count)
                # Sleep on error to prevent tight loop
                await asyncio.sleep(60)
    
    async def _run_all_checks(self) -> List[Issue]:
        """
        Run all detectors and validators concurrently.
        
        Returns list of detected issues.
        """
        tasks = []
        
        # Run detectors
        for name, detector in self.detectors.items():
            tasks.append(self._run_detector(name, detector))
        
        # Run validators
        for name, validator in self.validators.items():
            tasks.append(self._run_validator(name, validator))
        
        # Gather all results
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions and None results
        issues = []
        for result in results:
            if isinstance(result, Exception):
                logger.error("Check failed with exception", error=str(result))
            elif isinstance(result, Issue):
                issues.append(result)
            elif isinstance(result, list):
                issues.extend([i for i in result if isinstance(i, Issue)])
        
        return issues
    
    async def _run_detector(self, name: str, detector) -> Optional[Issue]:
        """Run a single detector and return issue if detected"""
        try:
            logger.debug("Running detector", detector=name)
            issue = await detector.check()
            
            if issue:
                logger.info("Issue detected", 
                           detector=name,
                           severity=issue.severity.value,
                           system=issue.system)
                
                # Store in database
                async with StateDatabase(self.db_path) as db:
                    await db.record_issue(issue)
            
            return issue
            
        except Exception as e:
            logger.error("Detector failed", detector=name, error=str(e))
            return None
    
    async def _run_validator(self, name: str, validator) -> Optional[Issue]:
        """Run a single validator and return issue if detected"""
        try:
            logger.debug("Running validator", validator=name)
            # Validators take data parameter, pass None for now (they'll use defaults)
            issue = await validator.validate(None)
            
            if issue:
                logger.info("Validation issue detected",
                           validator=name,
                           severity=issue.severity.value,
                           system=issue.system)
                
                # Store in database
                async with StateDatabase(self.db_path) as db:
                    await db.record_issue(issue)
            
            return issue
            
        except Exception as e:
            logger.error("Validator failed", validator=name, error=str(e))
            return None
    
    async def _process_issue(self, issue: Issue):
        """
        Process a detected issue:
        1. Try to heal if auto-fixable
        2. Send alerts based on severity and heal result
        """
        logger.info("Processing issue", 
                   issue_id=issue.id[:8],
                   severity=issue.severity.value,
                   can_auto_fix=issue.can_auto_fix)
        
        if issue.can_auto_fix:
            # Attempt healing
            heal_result = await self._attempt_heal(issue)
            
            if heal_result:
                # Store heal attempt
                async with StateDatabase(self.db_path) as db:
                    await db.record_healing_action(issue, heal_result)
                
                # Alert based on heal result
                if heal_result.success:
                    # Successful heal - only alert for P0/P1
                    if issue.severity in [Severity.P0, Severity.P1]:
                        logger.info("Alerting on successful heal",
                                   issue_id=issue.id[:8],
                                   severity=issue.severity.value)
                        await self.alerter.send_heal_result(issue, heal_result)
                else:
                    # Heal failed - escalate
                    logger.warning("Heal failed, escalating",
                                  issue_id=issue.id[:8],
                                  message=heal_result.message)
                    await self.alerter.send_alert(issue, escalation=True)
                    await self.alerter.send_heal_result(issue, heal_result)
            else:
                # No healer available or couldn't heal
                logger.info("No heal attempted, alerting",
                           issue_id=issue.id[:8])
                await self.alerter.send_alert(issue)
        else:
            # Not auto-fixable, alert immediately
            logger.info("Issue not auto-fixable, alerting",
                       issue_id=issue.id[:8])
            await self.alerter.send_alert(issue)
    
    async def _attempt_heal(self, issue: Issue) -> Optional[HealResult]:
        """
        Find appropriate healer and attempt to heal the issue.
        
        Returns HealResult if healing was attempted, None otherwise.
        """
        # Find healer that can handle this issue
        for healer_name, healer in self.healers.items():
            try:
                if await healer.can_heal_issue(issue):
                    logger.info("Found healer for issue",
                               healer=healer_name,
                               issue_id=issue.id[:8])
                    
                    # Check cooldown
                    action_name = f"heal_{issue.system}"
                    if not await healer.can_heal(issue, action_name):
                        logger.info("Healer on cooldown or max attempts reached",
                                   healer=healer_name,
                                   issue_id=issue.id[:8])
                        return None
                    
                    # Attempt heal
                    logger.info("Attempting heal",
                               healer=healer_name,
                               issue_id=issue.id[:8])
                    
                    heal_result = await healer.heal(issue)
                    
                    # Record attempt
                    await healer.record_heal_attempt(issue, action_name)
                    
                    logger.info("Heal attempt complete",
                               healer=healer_name,
                               success=heal_result.success,
                               message=heal_result.message)
                    
                    return heal_result
                    
            except Exception as e:
                logger.error("Healer failed",
                            healer=healer_name,
                            issue_id=issue.id[:8],
                            error=str(e))
        
        # No healer found
        logger.debug("No healer found for issue",
                    issue_id=issue.id[:8],
                    system=issue.system)
        return None
    
    def stop(self):
        """Stop the monitoring loop gracefully"""
        logger.info("Stopping MonitorAgent")
        self.running = False


async def main():
    """Entry point for Monitor-Agent"""
    
    import os
    
    # Load webhook URL from environment
    discord_webhook = os.environ.get("DISCORD_WEBHOOK_URL", "")
    
    # Default configuration
    config = {
        "database": {
            "path": "data/monitor.db"
        },
        "healing": {
            "enabled": True,
            "max_attempts": 3,
            "cooldown_seconds": 300
        },
        "alerting": {
            "enabled": True,
            "discord": {
                "webhook_url": discord_webhook,
                "mention_user_id": "956203522624462918"
            },
            "deduplication_window_seconds": 300,
            "batch_interval_seconds": 900
        }
    }
    
    # Create and run agent
    agent = MonitorAgent(config)
    
    # Handle shutdown signals
    def signal_handler(sig, frame):
        logger.info("Received shutdown signal", signal=sig)
        agent.stop()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run main loop
    try:
        await agent.run()
    except Exception as e:
        logger.error("Fatal error in main", error=str(e))
        raise
    finally:
        logger.info("MonitorAgent stopped")


if __name__ == "__main__":
    asyncio.run(main())
