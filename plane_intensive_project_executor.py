import os
import sys
import json
import logging
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

class PlaneIntensiveProjectExecutor:
    def __init__(self, project_id='b7824695-65e5-4da6-ba57-3f7ac172266d'):
        self.project_id = project_id
        self.base_path = '/Users/zachgonser/clawd'
        self.workspace_slug = 'slurpnet'
        
        # Comprehensive logging setup
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            filename=os.path.join(self.base_path, 'plane_intensive_execution.log')
        )
        
        # Critical project scripts
        self.project_scripts = [
            'plane_project_validator.py',
            'plane_project_quality_enhancement.py',
            'plane_workflow_automation.py',
            'plane_deployment_strategy.py',
            'plane_post_deployment_actions.py',
            'plane_documentation_generator.py'
        ]
    
    def _execute_script(self, script_name):
        """Execute individual project script with comprehensive error handling"""
        script_path = os.path.join(self.base_path, script_name)
        log_path = os.path.join(self.base_path, f'{os.path.splitext(script_name)[0]}_execution.log')
        
        try:
            # Prepare execution command
            command = [
                sys.executable, 
                script_path, 
                f'--project-id={self.project_id}',
                f'--workspace={self.workspace_slug}',
                f'--log-file={log_path}'
            ]
            
            # Execute script with timeout and capture
            result = subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                timeout=1200  # 20-minute timeout for each script
            )
            
            # Log execution details
            logging.info(f"Executed {script_name}")
            logging.info(f"STDOUT: {result.stdout}")
            
            if result.stderr:
                logging.warning(f"STDERR for {script_name}: {result.stderr}")
            
            return {
                'script': script_name,
                'success': result.returncode == 0,
                'stdout': result.stdout,
                'stderr': result.stderr
            }
        
        except subprocess.TimeoutExpired:
            logging.error(f"Timeout expired for {script_name}")
            return {
                'script': script_name,
                'success': False,
                'error': 'Timeout expired'
            }
        except Exception as e:
            logging.error(f"Execution failed for {script_name}: {e}")
            return {
                'script': script_name,
                'success': False,
                'error': str(e)
            }
    
    def _parallel_script_execution(self):
        """Execute project scripts in parallel with dynamic thread management"""
        execution_results = []
        
        with ThreadPoolExecutor(max_workers=min(len(self.project_scripts), os.cpu_count())) as executor:
            # Submit all scripts for execution
            future_to_script = {
                executor.submit(self._execute_script, script): script 
                for script in self.project_scripts
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_script):
                script = future_to_script[future]
                try:
                    result = future.result()
                    execution_results.append(result)
                    
                    # Log individual script results
                    if result['success']:
                        logging.info(f"{script} executed successfully")
                    else:
                        logging.error(f"{script} execution failed")
                
                except Exception as e:
                    logging.error(f"Unexpected error in {script}: {e}")
        
        return execution_results
    
    def _generate_comprehensive_project_report(self, execution_results):
        """Create a comprehensive project execution report"""
        report = {
            'project_id': self.project_id,
            'workspace_slug': self.workspace_slug,
            'timestamp': datetime.now().isoformat(),
            'overall_success': all(result['success'] for result in execution_results),
            'script_results': execution_results
        }
        
        report_path = os.path.join(
            self.base_path, 
            f'plane_intensive_project_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        )
        
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        logging.info(f"Comprehensive project report generated: {report_path}")
        return report_path
    
    def execute_intensive_project_strategy(self):
        """Main method to drive project execution"""
        logging.info("Initiating Intensive Project Execution Strategy")
        
        # Execute scripts in parallel
        execution_results = self._parallel_script_execution()
        
        # Generate comprehensive report
        report_path = self._generate_comprehensive_project_report(execution_results)
        
        logging.info("Intensive Project Execution Complete")
        return report_path

def main():
    executor = PlaneIntensiveProjectExecutor()
    executor.execute_intensive_project_strategy()

if __name__ == '__main__':
    main()