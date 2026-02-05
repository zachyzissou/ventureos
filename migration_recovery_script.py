import os
import json
import logging
import subprocess
from datetime import datetime

class MigrationRecoveryTool:
    def __init__(self):
        # Logging setup
        log_dir = '/Users/zachgonser/clawd/logs/migration_recovery'
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f'migration_recovery_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        
        # Recovery targets
        self.recovery_targets = {
            'bloom': {
                'local_path': '/Users/zachgonser/clawd/projects/bloom',
                'backup_paths': [
                    '/Volumes/WindowsBackup/clawd/projects/bloom',
                    '/Users/zachgonser/Downloads/backup/bloom'
                ],
                'git_remote': 'git@github.com:slurpnet/bloom.git'
            },
            'stanton_times_agent': {
                'local_path': '/Users/zachgonser/clawd/projects/stanton-times-agent',
                'backup_paths': [
                    '/Volumes/WindowsBackup/clawd/projects/stanton-times-agent',
                    '/Users/zachgonser/Downloads/backup/stanton-times-agent'
                ],
                'git_remote': 'git@github.com:slurpnet/stanton-times-agent.git'
            }
        }
    
    def _run_command(self, command, cwd=None):
        """Execute shell command and capture output"""
        try:
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True,
                cwd=cwd
            )
            return result.stdout.strip(), result.stderr.strip(), result.returncode
        except Exception as e:
            logging.error(f"Command execution error: {e}")
            return "", str(e), 1
    
    def recover_repository(self, project_name):
        """Recover a specific repository"""
        target = self.recovery_targets.get(project_name)
        if not target:
            logging.error(f"No recovery configuration for {project_name}")
            return False
        
        # Ensure local directory exists
        os.makedirs(target['local_path'], exist_ok=True)
        
        # Try local backup paths first
        for backup_path in target['backup_paths']:
            if os.path.exists(backup_path):
                try:
                    # Copy entire directory
                    copy_cmd = f'cp -R "{backup_path}" "{target["local_path"]}"'
                    copy_output, copy_err, copy_code = self._run_command(copy_cmd)
                    
                    if copy_code == 0:
                        logging.info(f"Successfully copied {project_name} from {backup_path}")
                        break
                except Exception as e:
                    logging.error(f"Backup copy failed for {project_name}: {e}")
        
        # If no local backup, try git clone
        if not os.path.exists(os.path.join(target['local_path'], '.git')):
            clone_cmd = f'git clone {target["git_remote"]} "{target["local_path"]}"'
            clone_output, clone_err, clone_code = self._run_command(clone_cmd)
            
            if clone_code == 0:
                logging.info(f"Successfully cloned {project_name} from remote")
            else:
                logging.error(f"Git clone failed for {project_name}: {clone_err}")
                return False
        
        # Initialize git repository if needed
        init_cmd = f'cd "{target["local_path"]}" && git init && git add . && git commit -m "Initial recovery commit"'
        init_output, init_err, init_code = self._run_command(init_cmd)
        
        return init_code == 0
    
    def recover_all_repositories(self):
        """Recover all targeted repositories"""
        recovery_report = {}
        
        for project_name in self.recovery_targets.keys():
            recovery_report[project_name] = self.recover_repository(project_name)
        
        # Generate recovery report
        report_path = f'/Users/zachgonser/clawd/logs/migration_recovery/recovery_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump(recovery_report, f, indent=2)
        
        logging.info(f"Recovery report generated: {report_path}")
        return recovery_report

def main():
    recovery_tool = MigrationRecoveryTool()
    recovery_tool.recover_all_repositories()

if __name__ == '__main__':
    main()