import json
import logging
from datetime import datetime
import subprocess
import os

from src.config import PROJECT_ROOT, get_bird_auth_script, get_config_path, get_log_path, load_config

try:
    import psutil  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    psutil = None

class StantonTimesSystemMonitor:
    def __init__(self, config_path=None):
        # Load configuration
        self.config = load_config()
        self.config_path = config_path or str(get_config_path())
        
        # Logging setup
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - System Monitor - %(levelname)s - %(message)s',
            filename=get_log_path('system_monitor.log')
        )
        self.logger = logging.getLogger(__name__)

        # Critical process list
        self.critical_processes = [
            'bird_monitor.py',
            'discord_verifier.py',
            'reaction_monitor.py',
            'tweet_publisher.py'
        ]

    def get_system_resources(self):
        """
        Monitor system resources
        """
        if psutil is None:
            # Degraded mode (psutil not installed). Keep pipeline running.
            return {
                'cpu_usage': 0.0,
                'memory_usage': 0.0,
                'disk_usage': 0.0,
                'timestamp': datetime.utcnow().isoformat(),
                'psutil_available': False,
            }
        return {
            'cpu_usage': psutil.cpu_percent(),
            'memory_usage': psutil.virtual_memory().percent,
            'disk_usage': psutil.disk_usage('/').percent,
            'timestamp': datetime.utcnow().isoformat()
        }

    def check_critical_processes(self):
        """
        Check status of critical Stanton Times processes
        """
        process_status = {}
        
        for process_name in self.critical_processes:
            try:
                if psutil is None:
                    process_status[process_name] = {
                        'running': False,
                        'count': 0,
                        'details': [],
                        'psutil_available': False,
                    }
                    continue
                # Find processes matching the name
                processes = [p for p in psutil.process_iter(['name', 'cmdline']) 
                             if process_name in ' '.join(p.info.get('cmdline', []))]
                
                process_status[process_name] = {
                    'running': bool(processes),
                    'count': len(processes),
                    'details': [
                        {
                            'pid': p.pid,
                            'cpu_percent': p.cpu_percent(),
                            'memory_percent': p.memory_percent()
                        } for p in processes
                    ] if processes else []
                }
            except Exception as e:
                self.logger.error(f"Error checking process {process_name}: {e}")
                process_status[process_name] = {
                    'running': False,
                    'error': str(e)
                }
        
        return process_status

    def generate_health_report(self):
        """
        Generate a comprehensive system health report
        """
        report = {
            'timestamp': datetime.utcnow().isoformat(),
            'system_resources': self.get_system_resources(),
            'process_status': self.check_critical_processes(),
            'twitter_api_status': self._check_twitter_api(),
            'discord_bot_status': self._check_discord_connection()
        }
        
        # Log health report
        self.logger.info(json.dumps(report, indent=2))
        
        return report

    def _check_twitter_api(self):
        """
        Check Twitter API connectivity via bird CLI
        """
        try:
            bird_auth = get_bird_auth_script()
            result = subprocess.run(
                [bird_auth, 'whoami'],
                capture_output=True, 
                text=True, 
                timeout=10
            )
            return {
                'connected': result.returncode == 0,
                'output': result.stdout.strip()
            }
        except Exception as e:
            return {
                'connected': False,
                'error': str(e)
            }

    def _check_discord_connection(self):
        """
        Verify Discord bot connection status
        """
        try:
            if psutil is None:
                return {
                    'connected': False,
                    'process_count': 0,
                    'psutil_available': False,
                }
            # Check if Discord bot process is running
            processes = [p for p in psutil.process_iter(['name', 'cmdline']) 
                         if any('discord_verifier.py' in cmd for cmd in p.cmdline())]
            
            return {
                'connected': bool(processes),
                'process_count': len(processes)
            }
        except Exception as e:
            return {
                'connected': False,
                'error': str(e)
            }

    def auto_recover(self, report):
        """
        Attempt to recover from system issues
        """
        recovery_actions = []
        
        # Check system resource thresholds
        if report['system_resources']['cpu_usage'] > 80:
            recovery_actions.append("High CPU usage detected. Consider optimizing processes.")
        
        # Check process status
        for process, status in report['process_status'].items():
            if not status['running']:
                recovery_command = f"python3 {PROJECT_ROOT / process}"
                try:
                    subprocess.Popen(recovery_command.split())
                    recovery_actions.append(f"Restarted {process}")
                except Exception as e:
                    recovery_actions.append(f"Failed to restart {process}: {e}")
        
        # Log recovery actions
        if recovery_actions:
            self.logger.warning("Recovery actions taken: " + json.dumps(recovery_actions))
        
        return recovery_actions

def main():
    # Example usage
    monitor = StantonTimesSystemMonitor()
    
    # Generate and print health report
    report = monitor.generate_health_report()
    print(json.dumps(report, indent=2))
    
    # Attempt auto-recovery
    recovery_actions = monitor.auto_recover(report)
    print("Recovery Actions:", recovery_actions)

if __name__ == "__main__":
    main()
