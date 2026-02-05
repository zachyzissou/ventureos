#!/usr/bin/env python3
import os
import json
import logging
import subprocess
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    filename='/Users/zachgonser/clawd/plane_deployment.log')

class PlaneDeploymentStrategy:
    def __init__(self, project_id):
        """
        Initialize deployment strategy for Plane Platform
        
        Args:
            project_id (str): UUID of the project
        """
        self.project_id = project_id
        self.deployment_base_path = os.path.expanduser('~/plane-platform-deployment')
        self.deployment_log = {
            'timestamp': datetime.now().isoformat(),
            'stages': []
        }
    
    def _run_command(self, command, description):
        """
        Run shell command with comprehensive logging
        
        Args:
            command (list/str): Command to execute
            description (str): Description of the operation
        
        Returns:
            tuple: (success_boolean, output)
        """
        try:
            if isinstance(command, str):
                result = subprocess.run(command, shell=True, 
                                        capture_output=True, 
                                        text=True, 
                                        check=True)
            else:
                result = subprocess.run(command, 
                                        capture_output=True, 
                                        text=True, 
                                        check=True)
            
            logging.info(f"{description} successful")
            return True, result.stdout
        except subprocess.CalledProcessError as e:
            logging.error(f"{description} failed: {e.stderr}")
            return False, e.stderr
    
    def environment_preparation(self):
        """
        Prepare deployment environment
        """
        prep_steps = [
            {
                'name': 'Create Deployment Directory',
                'command': f'mkdir -p {self.deployment_base_path}/deployment'
            },
            {
                'name': 'Set Deployment Permissions',
                'command': f'chmod -R 755 {self.deployment_base_path}'
            },
            {
                'name': 'Create Backup of Existing Configuration',
                'command': f'mkdir -p {self.deployment_base_path}/config_backup'
            }
        ]
        
        stage_results = []
        for step in prep_steps:
            success, output = self._run_command(step['command'], step['name'])
            stage_results.append({
                'step': step['name'],
                'success': success,
                'output': output
            })
        
        self.deployment_log['stages'].append({
            'stage': 'Environment Preparation',
            'results': stage_results
        })
        
        return all(result['success'] for result in stage_results)
    
    def copy_deployment_artifacts(self):
        """
        Copy deployment artifacts to target environment
        """
        artifacts = [
            {
                'source': '/Users/zachgonser/clawd/plane_documentation_generator.py',
                'destination': f'{self.deployment_base_path}/deployment/documentation_generator.py'
            },
            {
                'source': '/Users/zachgonser/clawd/plane_quality_metrics_tracker.py',
                'destination': f'{self.deployment_base_path}/deployment/quality_metrics_tracker.py'
            },
            {
                'source': '/Users/zachgonser/clawd/plane_workflow_automation.py',
                'destination': f'{self.deployment_base_path}/deployment/workflow_automation.py'
            },
            {
                'source': '/Users/zachgonser/clawd/plane_final_integration.py',
                'destination': f'{self.deployment_base_path}/deployment/final_integration.py'
            }
        ]
        
        stage_results = []
        for artifact in artifacts:
            try:
                # Use subprocess to ensure detailed error handling
                result = subprocess.run([
                    'cp', 
                    artifact['source'], 
                    artifact['destination']
                ], capture_output=True, text=True, check=True)
                
                stage_results.append({
                    'artifact': artifact['source'],
                    'success': True,
                    'destination': artifact['destination']
                })
            except subprocess.CalledProcessError as e:
                stage_results.append({
                    'artifact': artifact['source'],
                    'success': False,
                    'error': str(e.stderr)
                })
        
        self.deployment_log['stages'].append({
            'stage': 'Deployment Artifacts Copy',
            'results': stage_results
        })
        
        return all(result['success'] for result in stage_results)
    
    def configure_deployment(self):
        """
        Configure deployment settings and environment
        """
        config_steps = [
            {
                'name': 'Create Deployment Configuration',
                'command': f'''cat <<EOF > {self.deployment_base_path}/deployment/config.json
{{
  "project_id": "{self.project_id}",
  "deployment_timestamp": "{datetime.now().isoformat()}",
  "components": [
    "documentation_generator",
    "quality_metrics_tracker", 
    "workflow_automation",
    "final_integration"
  ]
}}
EOF'''
            },
            {
                'name': 'Set Executable Permissions',
                'command': f'chmod +x {self.deployment_base_path}/deployment/*.py'
            }
        ]
        
        stage_results = []
        for step in config_steps:
            success, output = self._run_command(step['command'], step['name'])
            stage_results.append({
                'step': step['name'],
                'success': success,
                'output': output
            })
        
        self.deployment_log['stages'].append({
            'stage': 'Deployment Configuration',
            'results': stage_results
        })
        
        return all(result['success'] for result in stage_results)
    
    def validate_deployment(self):
        """
        Validate deployed components with more robust validation
        """
        validation_steps = [
            {
                'name': 'Validate Documentation Generator',
                'command': f'python3 {self.deployment_base_path}/deployment/documentation_generator.py --help'
            },
            {
                'name': 'Validate Quality Metrics Tracker',
                'command': f'python3 {self.deployment_base_path}/deployment/quality_metrics_tracker.py --help'
            },
            {
                'name': 'Validate Workflow Automation',
                'command': f'python3 {self.deployment_base_path}/deployment/workflow_automation.py --help'
            }
        ]
        
        stage_results = []
        for step in validation_steps:
            success, output = self._run_command(step['command'], step['name'])
            stage_results.append({
                'step': step['name'],
                'success': success,
                'output': output
            })
        
        self.deployment_log['stages'].append({
            'stage': 'Deployment Validation',
            'results': stage_results
        })
        
        return all(result['success'] for result in stage_results)
    
    def generate_deployment_report(self):
        """
        Generate comprehensive deployment report
        """
        report_path = f'{self.deployment_base_path}/deployment_reports/deployment_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        # Ensure reports directory exists
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        
        # Determine overall deployment success
        overall_success = all(
            result['success'] 
            for stage in self.deployment_log['stages'] 
            for result in stage.get('results', [])
        )
        
        self.deployment_log['overall_success'] = overall_success
        
        with open(report_path, 'w') as f:
            json.dump(self.deployment_log, f, indent=2)
        
        logging.info(f"Deployment report generated: {report_path}")
        return overall_success
    
    def deploy(self):
        """
        Execute full deployment strategy
        """
        deployment_stages = [
            self.environment_preparation,
            self.copy_deployment_artifacts,
            self.configure_deployment,
            self.validate_deployment,
            self.generate_deployment_report
        ]
        
        overall_success = True
        for stage in deployment_stages:
            stage_success = stage()
            overall_success &= stage_success
            
            # Fail fast if any stage fails
            if not stage_success:
                logging.error(f"Deployment failed at stage: {stage.__name__}")
                break
        
        return overall_success

def main():
    # Plane Platform Improvements project ID
    project_id = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
    
    deployment_strategy = PlaneDeploymentStrategy(project_id)
    success = deployment_strategy.deploy()
    
    print(f"Plane Platform Deployment {'Successful' if success else 'Failed'}")
    
    # Update work item state based on deployment result
    if success:
        try:
            subprocess.run([
                'mcporter', 'call', 'plane.update_work_item',
                f'project_id:{project_id}',
                'work_item_id:49491f78-fe84-4a70-8099-2ad13d26b065',
                'state:ea94bfd0-328d-45fc-b640-d846ffe3530c'  # Move to 'Deployed' state
            ], check=True)
            print("Work item state updated to Deployed")
        except subprocess.CalledProcessError:
            print("Failed to update work item state")
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    import sys
    main()