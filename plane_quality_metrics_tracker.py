#!/usr/bin/env python3
import os
import json
from datetime import datetime
import subprocess

class PlaneQualityMetricsTracker:
    def __init__(self, project_id):
        """
        Initialize quality metrics tracker
        
        Args:
            project_id (str): UUID of the project
        """
        self.project_id = project_id
        self.metrics_log_path = f'/Users/zachgonser/clawd/metrics_logs/{project_id}_quality_metrics.json'
        self.metrics = {
            'project_id': project_id,
            'tracked_at': datetime.now().isoformat(),
            'metrics': {
                'work_items': {
                    'total_count': 0,
                    'by_type': {},
                    'by_state': {}
                },
                'quality_indicators': {
                    'open_issues': 0,
                    'resolved_issues': 0,
                    'work_item_completion_rate': 0
                }
            }
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
            return True, result.stdout
        except subprocess.CalledProcessError as e:
            print(f"Error in {description}: {e.stderr}")
            return False, None
    
    def collect_work_item_metrics(self):
        """
        Collect metrics about work items in the project
        """
        # Get all work items
        success, output = self._run_mcporter_call(
            ['mcporter', 'call', 'plane.list_work_items', 
             f'project_id:{self.project_id}'], 
            "List work items"
        )
        
        if not success:
            return
        
        try:
            work_items = json.loads(output)
        except json.JSONDecodeError:
            work_items = []
        
        # Aggregate metrics
        self.metrics['metrics']['work_items']['total_count'] = len(work_items)
        
        # Count by type and state
        type_counts = {}
        state_counts = {}
        
        for item in work_items:
            # Safely handle type and state
            item_type = item.get('type', {})
            if isinstance(item_type, dict):
                item_type = item_type.get('name', 'Untyped')
            
            item_state = item.get('state', {})
            if isinstance(item_state, dict):
                item_state = item_state.get('name', 'Unspecified')
            
            # Count by type and state
            type_counts[item_type] = type_counts.get(item_type, 0) + 1
            state_counts[item_state] = state_counts.get(item_state, 0) + 1
        
        self.metrics['metrics']['work_items']['by_type'] = type_counts
        self.metrics['metrics']['work_items']['by_state'] = state_counts
    
    def track_issue_resolution(self):
        """
        Track issue resolution metrics
        """
        # Predefined open and resolved states
        open_states = ['Backlog', 'Todo', 'In Progress', 'Blocked']
        resolved_states = ['Done', 'Deployed']
        
        success, output = self._run_mcporter_call(
            ['mcporter', 'call', 'plane.list_work_items', 
             f'project_id:{self.project_id}'], 
            "List work items for resolution tracking"
        )
        
        if not success:
            return
        
        try:
            work_items = json.loads(output)
        except json.JSONDecodeError:
            work_items = []
        
        open_issues = sum(1 for item in work_items 
                          if any(open_state in str(item.get('state', '')) for open_state in open_states))
        resolved_issues = sum(1 for item in work_items 
                              if any(resolved_state in str(item.get('state', '')) for resolved_state in resolved_states))
        
        total_items = len(work_items)
        completion_rate = (resolved_issues / total_items * 100) if total_items > 0 else 0
        
        self.metrics['metrics']['quality_indicators']['open_issues'] = open_issues
        self.metrics['metrics']['quality_indicators']['resolved_issues'] = resolved_issues
        self.metrics['metrics']['quality_indicators']['work_item_completion_rate'] = completion_rate
    
    def generate_metrics_report(self):
        """
        Generate and save quality metrics report
        """
        # Collect all metrics
        self.collect_work_item_metrics()
        self.track_issue_resolution()
        
        # Ensure metrics log directory exists
        os.makedirs(os.path.dirname(self.metrics_log_path), exist_ok=True)
        
        # Save metrics log
        with open(self.metrics_log_path, 'w') as f:
            json.dump(self.metrics, f, indent=2)
        
        return self.metrics

def main():
    project_id = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
    metrics_tracker = PlaneQualityMetricsTracker(project_id)
    metrics = metrics_tracker.generate_metrics_report()
    
    print("Quality Metrics Report Generated:")
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    main()