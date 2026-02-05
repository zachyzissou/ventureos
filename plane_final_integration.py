#!/usr/bin/env python3
import os
import json
import subprocess
import logging
import sys
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    filename='/Users/zachgonser/clawd/plane_final_integration.log')

class PlanePlatformFinalIntegration:
    def __init__(self, project_id):
        """
        Initialize final integration for Plane Platform
        
        Args:
            project_id (str): UUID of the project
        """
        self.project_id = project_id
        self.integration_log = {
            'timestamp': datetime.now().isoformat(),
            'steps': []
        }
    
    def _run_mcporter_call(self, command, description):
        """
        Execute mcporter call with error handling
        
        Args:
            command (list): Command to execute
            description (str): Description of the operation
        
        Returns:
            tuple: (success_boolean, output)
        """
        try:
            result = subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                check=True
            )
            logging.info(f"{description} successful")
            return True, result.stdout
        except subprocess.CalledProcessError as e:
            logging.error(f"{description} failed: {e.stderr}")
            return False, e.stderr
    
    def validate_project_configuration(self):
        """
        Comprehensive validation of project configuration
        """
        steps = [
            # Verify states
            {
                'name': 'Validate Workflow States',
                'action': lambda: self._run_mcporter_call(
                    ['mcporter', 'call', 'plane.list_states', 
                     f'project_id:{self.project_id}'], 
                    "List project states"
                )
            },
            # Verify feature toggles
            {
                'name': 'Verify Project Features',
                'action': lambda: self._run_mcporter_call(
                    ['mcporter', 'call', 'plane.get_project_features', 
                     f'project_id:{self.project_id}'], 
                    "Get project features"
                )
            },
            # Verify work item types
            {
                'name': 'Verify Work Item Types',
                'action': lambda: self._run_mcporter_call(
                    ['mcporter', 'call', 'plane.list_work_item_types', 
                     f'project_id:{self.project_id}'], 
                    "List work item types"
                )
            }
        ]
        
        validation_results = []
        for step in steps:
            success, output = step['action']()
            validation_results.append({
                'name': step['name'],
                'success': success,
                'output': output
            })
        
        self.integration_log['steps'].append({
            'stage': 'Project Configuration Validation',
            'results': validation_results
        })
        
        return all(result['success'] for result in validation_results)
    
    def generate_comprehensive_documentation(self):
        """
        Generate comprehensive project documentation
        """
        # Run documentation generator
        doc_generator_path = '/Users/zachgonser/clawd/plane_documentation_generator.py'
        try:
            subprocess.run(['/usr/bin/env', 'python3', doc_generator_path], check=True)
            
            self.integration_log['steps'].append({
                'stage': 'Documentation Generation',
                'success': True,
                'details': 'Comprehensive documentation created'
            })
            return True
        except subprocess.CalledProcessError:
            self.integration_log['steps'].append({
                'stage': 'Documentation Generation',
                'success': False,
                'details': 'Failed to generate documentation'
            })
            return False
    
    def run_quality_metrics_tracking(self):
        """
        Run quality metrics tracking
        """
        metrics_tracker_path = '/Users/zachgonser/clawd/plane_quality_metrics_tracker.py'
        try:
            result = subprocess.run(['/usr/bin/env', 'python3', metrics_tracker_path], 
                                    capture_output=True, text=True, check=True)
            
            self.integration_log['steps'].append({
                'stage': 'Quality Metrics Tracking',
                'success': True,
                'metrics': result.stdout
            })
            return True
        except subprocess.CalledProcessError:
            self.integration_log['steps'].append({
                'stage': 'Quality Metrics Tracking',
                'success': False,
                'details': 'Failed to run metrics tracking'
            })
            return False
    
    def execute_workflow_automation(self):
        """
        Execute workflow automation
        """
        workflow_automation_path = '/Users/zachgonser/clawd/plane_workflow_automation.py'
        try:
            result = subprocess.run(['/usr/bin/env', 'python3', workflow_automation_path], 
                                    capture_output=True, text=True, check=True)
            
            self.integration_log['steps'].append({
                'stage': 'Workflow Automation',
                'success': True,
                'actions': result.stdout
            })
            return True
        except subprocess.CalledProcessError:
            self.integration_log['steps'].append({
                'stage': 'Workflow Automation',
                'success': False,
                'details': 'Failed to execute workflow automation'
            })
            return False
    
    def finalize_integration(self):
        """
        Perform final integration steps and generate report
        """
        # Run all integration stages
        stages = [
            self.validate_project_configuration,
            self.generate_comprehensive_documentation,
            self.run_quality_metrics_tracking,
            self.execute_workflow_automation
        ]
        
        overall_success = True
        for stage in stages:
            stage_success = stage()
            overall_success &= stage_success
        
        # Generate final integration report
        report_path = f'/Users/zachgonser/clawd/plane_integration_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump({
                'project_id': self.project_id,
                'timestamp': datetime.now().isoformat(),
                'overall_success': overall_success,
                'log': self.integration_log
            }, f, indent=2)
        
        logging.info(f"Final integration report generated: {report_path}")
        return overall_success

def main():
    # Plane Platform Improvements project ID
    project_id = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
    
    integrator = PlanePlatformFinalIntegration(project_id)
    success = integrator.finalize_integration()
    
    print(f"Plane Platform Integration {'Successful' if success else 'Failed'}")
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()