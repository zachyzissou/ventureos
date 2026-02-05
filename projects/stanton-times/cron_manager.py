import subprocess
import json
import logging
from datetime import datetime, timedelta

class StantonTimesCronManager:
    def __init__(self, config_path):
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    def create_cron_jobs(self):
        cron_jobs = [
            {
                'name': 'source_monitor',
                'command': f'{self.config["project_path"]}/.venv/bin/python {self.config["project_path"]}/source_monitor.py',
                'schedule': '*/30 * * * *'  # Every 30 minutes
            },
            {
                'name': 'tweet_publisher',
                'command': f'{self.config["project_path"]}/.venv/bin/python {self.config["project_path"]}/tweet_publisher.py',
                'schedule': '0 * * * *'  # Hourly
            },
            {
                'name': 'content_cleanup',
                'command': f'{self.config["project_path"]}/.venv/bin/python {self.config["project_path"]}/content_cleanup.py',
                'schedule': '0 0 * * *'  # Daily at midnight
            }
        ]

        for job in cron_jobs:
            cron_command = f'(crontab -l 2>/dev/null; echo "{job["schedule"]} {job["command"]}") | crontab -'
            subprocess.run(cron_command, shell=True, check=True)
            self.logger.info(f'Installed cron job: {job["name"]}')

    def list_cron_jobs(self):
        result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
        return result.stdout

    def remove_cron_jobs(self, job_names=None):
        current_crontab = self.list_cron_jobs()
        
        if job_names:
            # Remove specific jobs
            lines = current_crontab.split('\n')
            filtered_lines = [line for line in lines 
                              if not any(name in line for name in job_names)]
            
            new_crontab = '\n'.join(filtered_lines)
            
            # Write back filtered crontab
            process = subprocess.Popen(['crontab'], stdin=subprocess.PIPE, text=True)
            process.communicate(input=new_crontab)
        else:
            # Remove all Stanton Times related jobs
            process = subprocess.Popen(['crontab', '-r'])
            process.wait()

        self.logger.info('Cron jobs updated')

def main():
    manager = StantonTimesCronManager('/Users/zachgonser/clawd/projects/stanton-times/config.json')
    manager.create_cron_jobs()

if __name__ == "__main__":
    main()