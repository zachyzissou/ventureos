import os
import json
import shutil
import logging
from datetime import datetime

class ComprehensiveMigrationTool:
    def __init__(self):
        # Source and destination paths
        self.mac_base = '/Users/zachgonser'
        
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            filename=os.path.join(self.mac_base, 'clawd', 'migration_log.txt')
        )
        
        # Migration components with flexible path resolution
        self.migration_components = [
            {
                'name': 'Stanton Times Agent',
                'sources': [
                    '/Users/zachgonser/stanton-times-agent',
                    '/Volumes/WindowsBackup/Users/Zachg/clawd/stanton-times-agent'
                ],
                'destination': os.path.join(self.mac_base, 'clawd', 'projects', 'stanton-times-agent'),
                'priority': 'critical'
            },
            {
                'name': 'Knowledge Graph',
                'sources': [
                    '/Users/zachgonser/life/areas',
                    '/Volumes/WindowsBackup/Users/Zachg/clawd/life/areas'
                ],
                'destination': os.path.join(self.mac_base, 'clawd', 'life', 'areas'),
                'priority': 'important'
            },
            {
                'name': 'Google MCP Credentials',
                'sources': [
                    '/Users/zachgonser/.openclaw/google-mcp',
                    '/Volumes/WindowsBackup/Users/Zachg/.openclaw/google-mcp'
                ],
                'destination': os.path.join(self.mac_base, '.openclaw', 'google-mcp'),
                'priority': 'high'
            },
            {
                'name': 'Cron Jobs Configuration',
                'sources': [
                    '/Users/zachgonser/.openclaw/cron',
                    '/Volumes/WindowsBackup/Users/Zachg/.openclaw/cron'
                ],
                'destination': os.path.join(self.mac_base, '.openclaw', 'cron'),
                'priority': 'medium'
            }
        ]
    
    def _safe_copy(self, sources, destination):
        """Safely copy files/directories with flexible source handling"""
        for source in sources:
            try:
                # Ensure source exists
                if not os.path.exists(source):
                    logging.warning(f"Source path not found: {source}")
                    continue
                
                # Ensure destination directory exists
                os.makedirs(destination, exist_ok=True)
                
                # Copy with metadata preservation
                if os.path.isdir(source):
                    shutil.copytree(source, destination, dirs_exist_ok=True)
                else:
                    shutil.copy2(source, destination)
                
                logging.info(f"Successfully copied {source} to {destination}")
                return True
            except Exception as e:
                logging.error(f"Migration failed for {source}: {e}")
        
        return False
    
    def _verify_credentials(self):
        """Verify and secure sensitive credentials"""
        credentials_to_verify = [
            'twitter_api.json',
            '.accounts.json',
            '.gauth.json',
            'openclaw.json'
        ]
        
        verified_credentials = []
        potential_paths = [
            '/Users/zachgonser/.openclaw',
            '/Users/zachgonser/clawd',
            '/Volumes/WindowsBackup/Users/Zachg/.openclaw',
            '/Volumes/WindowsBackup/Users/Zachg/clawd'
        ]
        
        for cred_file in credentials_to_verify:
            for path in potential_paths:
                full_path = os.path.join(path, cred_file)
                if os.path.exists(full_path):
                    try:
                        with open(full_path, 'r') as f:
                            cred_data = json.load(f)
                        
                        # Perform basic validation
                        if cred_data and isinstance(cred_data, dict):
                            verified_credentials.append({
                                'file': cred_file,
                                'path': full_path,
                                'keys': list(cred_data.keys())
                            })
                            break
                    except Exception as e:
                        logging.warning(f"Credential verification failed for {full_path}: {e}")
        
        return verified_credentials
    
    def migrate(self):
        """Execute comprehensive migration"""
        migration_report = {
            'timestamp': datetime.now().isoformat(),
            'components': []
        }
        
        # Migrate verified components
        for component in self.migration_components:
            migration_status = self._safe_copy(
                component['sources'], 
                component['destination']
            )
            
            migration_report['components'].append({
                'name': component['name'],
                'sources': component['sources'],
                'destination': component['destination'],
                'priority': component['priority'],
                'success': migration_status
            })
        
        # Verify credentials
        verified_creds = self._verify_credentials()
        migration_report['credentials'] = verified_creds
        
        # Generate migration report
        report_path = os.path.join(
            self.mac_base, 
            'clawd', 
            f'migration_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        )
        
        with open(report_path, 'w') as f:
            json.dump(migration_report, f, indent=2)
        
        logging.info(f"Migration complete. Report generated: {report_path}")
        return migration_report

def main():
    migrator = ComprehensiveMigrationTool()
    migrator.migrate()

if __name__ == '__main__':
    main()