import os
import json
import logging
from datetime import datetime, timedelta
import subprocess

class BloomCIFailureInvestigator:
    def __init__(self):
        # Logging setup
        log_dir = '/Users/zachgonser/clawd/logs/bloom_ci'
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f'bloom_ci_failure_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        
        # Bloom repository details
        self.repo_path = '/Users/zachgonser/clawd/projects/bloom'
        self.ci_failures = [
            'Run Tests',
            'Build Linux Server (Headless)',
            'Build Windows Client (IL2CPP)',
            'Project Delivery Date Workflow',
            'Project Roadmap Dates Workflow'
        ]
    
    def _run_command(self, command, cwd=None):
        """Run shell command and capture output"""
        try:
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True, 
                cwd=cwd or self.repo_path
            )
            return result.stdout.strip(), result.stderr.strip(), result.returncode
        except Exception as e:
            logging.error(f"Command execution error: {e}")
            return "", str(e), 1
    
    def investigate_ci_failures(self):
        """Comprehensive CI failure investigation"""
        investigation_report = {
            'timestamp': datetime.now().isoformat(),
            'failures': []
        }
        
        # Change to repository directory
        os.chdir(self.repo_path)
        
        # Fetch latest changes
        fetch_output, fetch_err, fetch_code = self._run_command('git fetch origin')
        logging.info(f"Git Fetch - Code: {fetch_code}, Output: {fetch_output}, Error: {fetch_err}")
        
        # Get recent commits
        log_output, log_err, log_code = self._run_command(
            'git log origin/master -n 5 --pretty=format:"%h - %an, %ar : %s"'
        )
        
        # Check GitHub Actions
        gh_output, gh_err, gh_code = self._run_command(
            'gh run list --workflow="CI" --branch=master --limit 10'
        )
        
        # Analyze each failure type
        for failure in self.ci_failures:
            failure_details = {
                'name': failure,
                'potential_causes': [],
                'recommended_actions': []
            }
            
            # Specific investigation for each failure type
            if 'Run Tests' in failure:
                # Check test configuration
                test_output, test_err, test_code = self._run_command('npm test')
                failure_details['test_output'] = test_output
                failure_details['potential_causes'].append('Test suite configuration issue')
                failure_details['recommended_actions'].append('Review test configuration')
            
            if 'Build Linux Server' in failure:
                # Check build dependencies
                build_output, build_err, build_code = self._run_command('./scripts/build_linux.sh')
                failure_details['build_output'] = build_output
                failure_details['potential_causes'].append('Linux build dependency missing')
                failure_details['recommended_actions'].append('Verify Linux build dependencies')
            
            # Add to report
            investigation_report['failures'].append(failure_details)
        
        # Generate comprehensive report
        report_path = f'/Users/zachgonser/clawd/logs/bloom_ci/bloom_ci_failure_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump(investigation_report, f, indent=2)
        
        logging.info(f"CI Failure Investigation Complete. Report saved to {report_path}")
        
        return investigation_report

def main():
    investigator = BloomCIFailureInvestigator()
    investigator.investigate_ci_failures()

if __name__ == '__main__':
    main()