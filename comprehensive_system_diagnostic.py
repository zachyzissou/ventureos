import os
import sys
import json
import logging
import subprocess
from datetime import datetime
import platform
import sqlite3

class SystemDiagnostic:
    def __init__(self):
        # Setup logging
        log_dir = '/Users/zachgonser/clawd/logs/system_diagnostics'
        os.makedirs(log_dir, exist_ok=True)
        self.log_file = os.path.join(log_dir, f'system_diagnostic_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            handlers=[
                logging.FileHandler(self.log_file),
                logging.StreamHandler()
            ]
        )
        
        # Key diagnostic paths
        self.diagnostic_paths = {
            'clawd_root': '/Users/zachgonser/clawd',
            'echo_config': '/Users/zachgonser/.echo',
            'memory_dir': '/Users/zachgonser/clawd/memory',
            'projects_dir': '/Users/zachgonser/clawd/projects',
            'backup_dir': '/Volumes/WindowsBackup'
        }
        
        # Diagnostic report
        self.diagnostic_report = {
            'timestamp': datetime.now().isoformat(),
            'system_info': {},
            'directory_checks': {},
            'repository_status': {},
            'migration_integrity': {},
            'database_checks': {},
            'critical_issues': []
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
    
    def collect_system_info(self):
        """Gather comprehensive system information"""
        try:
            # Basic system details
            self.diagnostic_report['system_info'] = {
                'os': platform.system(),
                'release': platform.release(),
                'machine': platform.machine(),
                'processor': platform.processor(),
                'python_version': platform.python_version()
            }
            
            # Disk space
            df_output, df_err, df_code = self._run_command('df -h')
            self.diagnostic_report['system_info']['disk_space'] = df_output
            
            # Memory info
            free_output, free_err, free_code = self._run_command('free -h')
            self.diagnostic_report['system_info']['memory'] = free_output
            
            logging.info("System information collected successfully")
        except Exception as e:
            logging.error(f"Error collecting system info: {e}")
            self.diagnostic_report['critical_issues'].append(f"System info collection failed: {e}")
    
    def check_directory_integrity(self):
        """Verify critical directory structures"""
        for name, path in self.diagnostic_paths.items():
            check_result = {
                'exists': os.path.exists(path),
                'is_dir': os.path.isdir(path) if os.path.exists(path) else False,
                'contents': []
            }
            
            if check_result['exists'] and check_result['is_dir']:
                try:
                    check_result['contents'] = os.listdir(path)
                except Exception as e:
                    logging.error(f"Error listing contents of {path}: {e}")
            
            self.diagnostic_report['directory_checks'][name] = check_result
            
            # Flag critical issues
            if not check_result['exists']:
                self.diagnostic_report['critical_issues'].append(f"Directory not found: {path}")
    
    def check_repository_status(self):
        """Check status of key repositories"""
        repositories = [
            '/Users/zachgonser/clawd',
            '/Users/zachgonser/clawd/projects/stanton-times-agent',
            '/Users/zachgonser/clawd/projects/bloom'
        ]
        
        for repo in repositories:
            status = {
                'exists': os.path.exists(repo),
                'is_git_repo': False,
                'current_branch': None,
                'status': None
            }
            
            if status['exists']:
                # Check if it's a git repository
                git_dir = os.path.join(repo, '.git')
                status['is_git_repo'] = os.path.exists(git_dir)
                
                if status['is_git_repo']:
                    # Get current branch
                    branch_cmd, branch_err, branch_code = self._run_command('git rev-parse --abbrev-ref HEAD', cwd=repo)
                    status['current_branch'] = branch_cmd if branch_code == 0 else None
                    
                    # Get git status
                    status_cmd, status_err, status_code = self._run_command('git status -s', cwd=repo)
                    status['status'] = status_cmd if status_code == 0 else None
            
            self.diagnostic_report['repository_status'][repo] = status
            
            # Flag critical issues
            if not status['exists']:
                self.diagnostic_report['critical_issues'].append(f"Repository not found: {repo}")
            elif not status['is_git_repo']:
                self.diagnostic_report['critical_issues'].append(f"Not a git repository: {repo}")
    
    def check_database_integrity(self):
        """Verify integrity of SQLite databases"""
        databases = [
            '/Users/zachgonser/clawd/memory/main.sqlite',
            '/Users/zachgonser/clawd/memory/stanton-times.sqlite'
        ]
        
        for db_path in databases:
            db_check = {
                'exists': os.path.exists(db_path),
                'valid': False,
                'tables': [],
                'size': None
            }
            
            if db_check['exists']:
                try:
                    # Get file size
                    db_check['size'] = os.path.getsize(db_path)
                    
                    # Try to connect and check tables
                    with sqlite3.connect(db_path) as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                        db_check['tables'] = [table[0] for table in cursor.fetchall()]
                        db_check['valid'] = True
                except Exception as e:
                    logging.error(f"Database check failed for {db_path}: {e}")
                    db_check['valid'] = False
                    self.diagnostic_report['critical_issues'].append(f"Database integrity issue: {db_path}")
            
            self.diagnostic_report['database_checks'][db_path] = db_check
    
    def generate_comprehensive_report(self):
        """Generate and save comprehensive diagnostic report"""
        report_path = f'/Users/zachgonser/clawd/logs/system_diagnostics/comprehensive_diagnostic_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump(self.diagnostic_report, f, indent=2)
        
        logging.info(f"Comprehensive diagnostic report generated: {report_path}")
        
        return self.diagnostic_report

def main():
    diagnostic = SystemDiagnostic()
    
    # Run diagnostic checks
    diagnostic.collect_system_info()
    diagnostic.check_directory_integrity()
    diagnostic.check_repository_status()
    diagnostic.check_database_integrity()
    
    # Generate final report
    report = diagnostic.generate_comprehensive_report()
    
    # Print critical issues
    print("Critical Issues:")
    for issue in report.get('critical_issues', []):
        print(f"- {issue}")

if __name__ == '__main__':
    main()