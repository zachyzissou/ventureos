#!/usr/bin/env python3
import os
import json
import logging
import subprocess
import sys

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    filename='/Users/zachgonser/clawd/plane_project_configuration.log')

class PlaneProjectConfigurator:
    def __init__(self, project_id):
        """
        Initialize configurator for a specific project
        
        Args:
            project_id (str): UUID of the project to configure
        """
        self.project_id = project_id
    
    def _run_mcporter_call(self, command, description):
        """
        Run mcporter call with error handling and retry
        
        Args:
            command (list): Command to run
            description (str): Description of the operation
        
        Returns:
            tuple: (success_boolean, output)
        """
        max_attempts = 3
        for attempt in range(max_attempts):
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
                logging.warning(f"{description} failed (attempt {attempt+1}/{max_attempts}): {e.stderr}")
                if attempt == max_attempts - 1:
                    logging.error(f"Final attempt failed: {description}")
                    return False, e.stderr
        
        return False, "Unknown error"
    
    def create_work_item_types(self):
        """
        Create standardized work item types
        """
        work_item_types = [
            {
                "name": "Feature",
                "description": "New functionality or enhancement to existing systems",
                "is_epic": "false"
            },
            {
                "name": "Bug",
                "description": "Defect or unexpected behavior that needs fixing",
                "is_epic": "false"
            },
            {
                "name": "Epic",
                "description": "Large, complex work item that spans multiple sprints",
                "is_epic": "true"
            },
            {
                "name": "Research",
                "description": "Investigative work to explore new technologies or approaches",
                "is_epic": "false"
            },
            {
                "name": "Chore",
                "description": "Maintenance tasks, refactoring, or infrastructure work",
                "is_epic": "false"
            }
        ]
        
        for item_type in work_item_types:
            # First, delete existing type if it exists to prevent duplicates
            del_cmd = ['mcporter', 'call', 'plane.delete_work_item_type', 
                       f'project_id:{self.project_id}', 
                       f'work_item_type_id:{item_type["name"]}']
            self._run_mcporter_call(del_cmd, f"Delete existing type {item_type['name']}")
            
            # Then create the type
            cmd = ['mcporter', 'call', 'plane.create_work_item_type', 
                   f'project_id:{self.project_id}',
                   f'name:{item_type["name"]}',
                   f'description:{item_type["description"]}',
                   f'is_epic:{item_type["is_epic"]}']
            
            self._run_mcporter_call(cmd, f"Create work item type {item_type['name']}")
    
    def enable_project_features(self):
        """
        Enable key project features
        """
        features = [
            "time_tracking",
            "issue_types",
            "modules",
            "intake"
        ]
        
        # Flexible approach to feature enabling
        for feature in features:
            cmd = ['mcporter', 'call', 'plane.update_project_features', 
                   f'project_id:{self.project_id}', 
                   f'{feature}:true']
            
            self._run_mcporter_call(cmd, f"Enable {feature} feature")
    
    def create_project_views(self):
        """
        Create standardized project views
        """
        views = [
            {
                "name": "This Sprint",
                "description_html": "Work items scheduled for the current sprint"
            },
            {
                "name": "Blocked",
                "description_html": "Work items currently blocked or waiting on dependencies"
            },
            {
                "name": "Overdue",
                "description_html": "Work items past their target completion date"
            },
            {
                "name": "High Priority",
                "description_html": "Critical work items requiring immediate attention"
            }
        ]
        
        for view in views:
            # Delete existing view to prevent duplicates
            del_cmd = ['mcporter', 'call', 'plane.delete_project_page', 
                       f'project_id:{self.project_id}', 
                       f'page_id:{view["name"]}']
            self._run_mcporter_call(del_cmd, f"Delete existing view {view['name']}")
            
            # Create view
            cmd = ['mcporter', 'call', 'plane.create_project_page',
                   f'project_id:{self.project_id}',
                   f'name:{view["name"]}',
                   f'description_html:{view["description_html"]}']
            
            self._run_mcporter_call(cmd, f"Create view {view['name']}")
    
    def configure_project(self):
        """
        Run full project configuration
        """
        logging.info(f"Configuring project {self.project_id}")
        
        # Order matters: types, features, views
        self.create_work_item_types()
        self.enable_project_features()
        self.create_project_views()
        
        logging.info("Project configuration complete")

def main():
    # Plane Platform Improvements project ID
    project_id = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
    
    configurator = PlaneProjectConfigurator(project_id)
    configurator.configure_project()
    
    # Run validation after configuration
    subprocess.run(['python3', '/Users/zachgonser/clawd/plane_project_validator.py'], check=True)

if __name__ == "__main__":
    main()