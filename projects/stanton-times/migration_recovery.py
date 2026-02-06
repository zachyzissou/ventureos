import json
import os
import logging
from typing import Dict, List

from src.config import get_config_path, get_log_path

class StantonTimesMigrationRecovery:
    def __init__(self, old_config_path: str, new_config_path: str = None):
        # Load configurations
        with open(old_config_path, 'r') as f:
            self.old_config = json.load(f)
        
        new_config_path = new_config_path or str(get_config_path())
        with open(new_config_path, 'r') as f:
            self.new_config = json.load(f)
        
        self.new_config_path = new_config_path

        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - Migration - %(message)s',
            filename=get_log_path('migration_recovery.log')
        )
        self.logger = logging.getLogger(__name__)

    def recover_annual_events(self) -> Dict:
        """
        Recover and migrate annual events configuration
        """
        annual_events = self.old_config.get('annual_events', {})
        self.logger.info(f"Recovered {len(annual_events)} annual events")
        return annual_events

    def restore_reaction_handling(self) -> Dict:
        """
        Restore reaction handling configuration
        """
        return {
            'reaction_scripts': {
                'approve': 'reaction-confirm.mjs',
                'reject': 'reaction-confirm.mjs',
                'hold': 'reaction-confirm.mjs'
            },
            'color_codes': {
                'success': 0x57F287,
                'error': 0xED4245,
                'warning': 0xFEE75C,
                'info': 0x5865F2
            }
        }

    def migrate_notification_workflow(self) -> Dict:
        """
        Create a comprehensive notification workflow
        """
        return {
            'webhook_method': 'embed_with_reactions',
            'notification_stages': [
                'draft_created',
                'awaiting_review',
                'approved',
                'rejected',
                'published'
            ],
            'required_approvals': 2
        }

    def update_configuration(self):
        """
        Update the new configuration with recovered settings
        """
        self.new_config['annual_events'] = self.recover_annual_events()
        self.new_config['reaction_handling'] = self.restore_reaction_handling()
        self.new_config['notification_workflow'] = self.migrate_notification_workflow()

        # Write updated configuration
        with open(self.new_config_path, 'w') as f:
            json.dump(self.new_config, f, indent=2)
        
        self.logger.info("Configuration migration completed successfully")

def main():
    recovery = StantonTimesMigrationRecovery(
        '/tmp/stanton-times-agent/config/config.json'
    )
    recovery.update_configuration()

if __name__ == "__main__":
    main()