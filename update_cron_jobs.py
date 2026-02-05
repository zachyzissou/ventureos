import os
import re
import json
import logging
import subprocess

class CronJobUpdater:
    def __init__(self):
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            filename='/Users/zachgonser/clawd/cron_job_update.log'
        )
        
        # Potential cron job locations
        self.cron_locations = [
            '/Users/zachgonser/.openclaw/cron',
            '/Users/zachgonser/Library/LaunchAgents',
            '/usr/local/etc/cron.d',
            '/etc/cron.d'
        ]
        
        # Replacement mappings
        self.replacements = {
            'openclaw': 'openclaw',
            'openclaw': 'openclaw',
            'OpenClaw': 'OpenClaw',
            'OpenClaw': 'OpenClaw'
        }
    
    def _find_cron_files(self):
        """Find all cron-related files"""
        cron_files = []
        for location in self.cron_locations:
            if not os.path.exists(location):
                logging.warning(f"Cron location not found: {location}")
                continue
            
            for root, _, files in os.walk(location):
                for file in files:
                    # Common cron-related file extensions and names
                    if re.match(r'^(.*cron.*|.*job.*|.*schedule.*)', file, re.IGNORECASE):
                        full_path = os.path.join(root, file)
                        cron_files.append(full_path)
        
        return cron_files
    
    def _update_cron_file(self, file_path):
        """Update individual cron file"""
        try:
            # Read file content
            with open(file_path, 'r') as f:
                original_content = f.read()
            
            # Track changes
            modified_content = original_content
            changes = {}
            
            # Perform replacements
            for old, new in self.replacements.items():
                if old in modified_content:
                    modified_content = modified_content.replace(old, new)
                    changes[old] = new
            
            # Write back if changes were made
            if changes:
                with open(file_path, 'w') as f:
                    f.write(modified_content)
                
                logging.info(f"Updated cron file: {file_path}")
                logging.info(f"Changes: {json.dumps(changes, indent=2)}")
            
            return changes
        
        except Exception as e:
            logging.error(f"Error processing {file_path}: {e}")
            return {}
    
    def _reload_cron_jobs(self):
        """Reload cron jobs"""
        try:
            # macOS specific cron reload
            subprocess.run(['launchctl', 'stop', 'com.vix.cron'], check=True)
            subprocess.run(['launchctl', 'start', 'com.vix.cron'], check=True)
            logging.info("Cron jobs reloaded successfully")
        except Exception as e:
            logging.error(f"Failed to reload cron jobs: {e}")
    
    def update_cron_references(self):
        """Main method to update cron job references"""
        # Find all cron files
        cron_files = self._find_cron_files()
        
        # Track overall changes
        total_changes = {
            'files_processed': len(cron_files),
            'files_modified': 0,
            'total_replacements': {}
        }
        
        # Process each cron file
        for file_path in cron_files:
            file_changes = self._update_cron_file(file_path)
            
            if file_changes:
                total_changes['files_modified'] += 1
                for old, new in file_changes.items():
                    if old not in total_changes['total_replacements']:
                        total_changes['total_replacements'][old] = 0
                    total_changes['total_replacements'][old] += 1
        
        # Reload cron jobs
        self._reload_cron_jobs()
        
        # Generate and save report
        report_path = '/Users/zachgonser/clawd/cron_job_update_report.json'
        with open(report_path, 'w') as f:
            json.dump(total_changes, f, indent=2)
        
        logging.info(f"Cron job update complete. Report saved to {report_path}")
        return total_changes

def main():
    updater = CronJobUpdater()
    updater.update_cron_references()

if __name__ == '__main__':
    main()