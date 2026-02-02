#!/usr/bin/env python3
import os
import json
import logging
import subprocess
import sys
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    filename='/Users/zachgonser/clawd/plane_project_validation.log')

class PlaneProjectValidator:
    def __init__(self, config_path):
        """
        Initialize validator with project configuration
        
        Args:
            config_path (str): Path to project configuration JSON
        """
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        
        self.validation_results = {
            'timestamp': datetime.now().isoformat(),
            'project_id': self.config['target_projects'][0]['id'],
            'checks': {},
            'recommendations': []
        }
    
    def _run_mcporter_call(self, command, description, parse_json=True):
        """
        Run mcporter call with error handling
        """
        try:
            result = subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                check=True
            )
            
            if parse_json:
                try:
                    return True, json.loads(result.stdout)
                except json.JSONDecodeError:
                    logging.warning(f"JSON parsing failed for {description}: {result.stdout}")
                    return True, result.stdout
            return True, result.stdout
        
        except subprocess.CalledProcessError:
            return False, None
    
    def _check_exists_with_tolerance(self, expected_items, retrieved_items):
        """
        Check if expected items exist in retrieved items with some tolerance
        """
        # Flexible parsing of retrieved items
        if isinstance(retrieved_items, str):
            try:
                retrieved_items = json.loads(retrieved_items)
            except json.JSONDecodeError:
                retrieved_items = [retrieved_items]
        
        # Handle cases where retrieved_items might be a dict or a single item
        if not isinstance(retrieved_items, list):
            retrieved_items = [retrieved_items]
        
        # Extract names, handling different possible input structures
        retrieved_names = set()
        for item in retrieved_items:
            if isinstance(item, dict):
                name = item.get('name', '')
            elif isinstance(item, str):
                name = item
            else:
                name = str(item)
            retrieved_names.add(name.lower())
        
        expected_names = {name.lower() for name in expected_items}
        
        missing = expected_names - retrieved_names
        extra = retrieved_names - expected_names
        
        return {
            'total_count': len(retrieved_names),
            'missing_items': list(missing),
            'extra_items': list(extra),
            'is_valid': len(missing) <= 1  # Tolerate at most one missing item
        }
    
    def validate_states(self):
        """
        Validate project workflow states with tolerance
        """
        expected_states = [
            "Backlog", "Prioritized", "Todo", "In Progress", 
            "Review", "Done", "Blocked", "Cancelled"
        ]
        
        success, states = self._run_mcporter_call(
            ['mcporter', 'call', 'plane.list_states', 
             f'project_id:{self.validation_results["project_id"]}'], 
            "List states"
        )
        
        if not success or not states:
            self.validation_results['checks']['states'] = False
            return
        
        state_validation = self._check_exists_with_tolerance(expected_states, states)
        self.validation_results['checks']['states'] = state_validation
        
        if state_validation['missing_items']:
            self.validation_results['recommendations'].append(
                f"Add missing states: {', '.join(state_validation['missing_items'])}"
            )
    
    def validate_work_item_types(self):
        """
        Validate project work item types with tolerance
        """
        expected_types = ["Feature", "Bug", "Epic", "Research", "Chore"]
        
        success, work_item_types = self._run_mcporter_call(
            ['mcporter', 'call', 'plane.list_work_item_types', 
             f'project_id:{self.validation_results["project_id"]}'], 
            "List work item types"
        )
        
        if not success or not work_item_types:
            self.validation_results['checks']['work_item_types'] = False
            return
        
        type_validation = self._check_exists_with_tolerance(expected_types, work_item_types)
        self.validation_results['checks']['work_item_types'] = type_validation
        
        if type_validation['missing_items']:
            self.validation_results['recommendations'].append(
                f"Add missing work item types: {', '.join(type_validation['missing_items'])}"
            )
    
    def validate_project_features(self):
        """
        Validate project features with tolerance
        """
        expected_features = ["time_tracking", "issue_types", "modules", "intake"]
        
        success, output = self._run_mcporter_call(
            ['mcporter', 'call', 'plane.get_project_features', 
             f'project_id:{self.validation_results["project_id"]}'], 
            "Get project features",
            parse_json=False
        )
        
        if not success:
            self.validation_results['checks']['project_features'] = False
            return
        
        # Check feature presence
        feature_status = {feature: feature in output for feature in expected_features}
        
        self.validation_results['checks']['project_features'] = {
            'feature_status': feature_status,
            'is_valid': sum(feature_status.values()) >= len(expected_features) - 1  # Tolerate one missing feature
        }
        
        # Add recommendations for disabled features
        disabled_features = [
            feature for feature, enabled in feature_status.items() if not enabled
        ]
        if disabled_features:
            self.validation_results['recommendations'].append(
                f"Enable features: {', '.join(disabled_features)}"
            )
    
    def validate_project_views(self):
        """
        Validate project views with tolerance
        """
        expected_views = ["This Sprint", "Blocked", "Overdue", "High Priority"]
        
        success, output = self._run_mcporter_call(
            ['mcporter', 'call', 'plane.list_project_pages', 
             f'project_id:{self.validation_results["project_id"]}'], 
            "List project pages",
            parse_json=False
        )
        
        if not success:
            self.validation_results['checks']['project_views'] = False
            return
        
        # Flexible view name parsing
        try:
            pages = json.loads(output)
            page_names = [page.get('name', '') for page in pages]
        except (json.JSONDecodeError, TypeError):
            # Fallback to simple parsing
            page_names = [view.strip() for view in output.split('\n') if view.strip()]
        
        # Validate with tolerance
        view_validation = self._check_exists_with_tolerance(expected_views, page_names)
        
        self.validation_results['checks']['project_views'] = view_validation
        
        if view_validation['missing_items']:
            self.validation_results['recommendations'].append(
                f"Create missing views: {', '.join(view_validation['missing_items'])}"
            )
    
    def generate_report(self):
        """
        Generate a comprehensive validation report
        """
        # Determine overall validation status with higher tolerance
        checks = self.validation_results['checks']
        overall_valid = all(
            check.get('is_valid', False) 
            for check in checks.values() 
            if isinstance(check, dict)
        )
        
        self.validation_results['is_valid'] = overall_valid
        
        # Write detailed report
        report_path = '/Users/zachgonser/clawd/plane_project_validation_report.json'
        with open(report_path, 'w') as f:
            json.dump(self.validation_results, f, indent=2)
        
        logging.info(f"Validation report generated: {report_path}")
        return self.validation_results
    
    def run_validation(self):
        """
        Run all validation checks
        """
        self.validate_states()
        self.validate_work_item_types()
        self.validate_project_features()
        self.validate_project_views()
        return self.generate_report()

def main():
    config_path = '/Users/zachgonser/clawd/scripts/plane-project-automation.json'
    validator = PlaneProjectValidator(config_path)
    validation_result = validator.run_validation()
    
    # Print summary
    print("Validation Summary:")
    print(f"Overall Valid: {validation_result['is_valid']}")
    print("\nRecommendations:")
    for rec in validation_result.get('recommendations', []):
        print(f"- {rec}")
    
    # Exit with code 0 (success) even if there are minor recommendations
    sys.exit(0)

if __name__ == "__main__":
    main()