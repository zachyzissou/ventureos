import json
import logging
from datetime import datetime
from typing import Dict, List, Optional

from src.config import get_config_path, get_log_path, load_config

class StantonTimesPermissionManager:
    def __init__(self, config_path: str = None):
        # Load configuration
        self.config = load_config()
        self.config_path = config_path or str(get_config_path())
        
        # Logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - Permission Manager - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger(__name__)

        # Load permission mappings
        self.permissions = self._load_permissions()

    def _load_permissions(self) -> Dict[str, Dict]:
        """
        Load permission configurations
        """
        default_permissions = {
            'roles': {
                'admin': ['approve_all', 'reject_all', 'edit_config'],
                'moderator': ['approve', 'reject', 'view_drafts'],
                'contributor': ['submit_draft', 'view_own_drafts'],
                'reader': ['view_published']
            },
            'users': {
                # Specific user overrides can be added here
                '956203522624462918': ['admin']  # Your user ID
            }
        }
        
        # Override with any existing config
        return self.config.get('permissions', default_permissions)

    def check_permission(self, user_id: str, action: str) -> bool:
        """
        Check if a user has permission to perform an action
        """
        # Check user-specific permissions first
        if user_id in self.permissions.get('users', {}):
            user_roles = self.permissions['users'][user_id]
            for role in user_roles:
                if action in self.permissions['roles'].get(role, []):
                    return True
        
        # Default to most restrictive
        return False

    def get_user_roles(self, user_id: str) -> List[str]:
        """
        Get roles for a specific user
        """
        return self.permissions.get('users', {}).get(user_id, [])

    def add_user_role(self, user_id: str, role: str) -> bool:
        """
        Add a role to a user
        """
        if role not in self.permissions['roles']:
            self.logger.warning(f"Attempted to add non-existent role: {role}")
            return False
        
        if 'users' not in self.permissions:
            self.permissions['users'] = {}
        
        if user_id not in self.permissions['users']:
            self.permissions['users'][user_id] = []
        
        if role not in self.permissions['users'][user_id]:
            self.permissions['users'][user_id].append(role)
            self._save_permissions()
            return True
        
        return False

    def remove_user_role(self, user_id: str, role: str) -> bool:
        """
        Remove a role from a user
        """
        if user_id in self.permissions.get('users', {}):
            if role in self.permissions['users'][user_id]:
                self.permissions['users'][user_id].remove(role)
                self._save_permissions()
                return True
        
        return False

    def _save_permissions(self):
        """
        Save updated permissions to config
        """
        self.config['permissions'] = self.permissions
        
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=2)
        
        self.logger.info("Permissions updated and saved")

    def audit_log(self, user_id: str, action: str, status: str):
        """
        Log permission-related actions
        """
        log_entry = {
            'user_id': user_id,
            'action': action,
            'status': status,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Append to audit log
        with open(get_log_path('permission_audit.json'), 'a') as f:
            json.dump(log_entry, f)
            f.write('\n')

def main():
    # Example usage
    pm = StantonTimesPermissionManager()
    
    # Check permissions
    user_id = '956203522624462918'
    print(f"Can approve drafts: {pm.check_permission(user_id, 'approve')}")
    
    # Add a role
    pm.add_user_role(user_id, 'moderator')
    print(f"User roles: {pm.get_user_roles(user_id)}")

if __name__ == "__main__":
    main()