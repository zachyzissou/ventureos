import os
import logging
import subprocess
import json

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    filename='/Users/zachgonser/clawd/plane_automation.log')

class PlaneProjectAutomator:
    def __init__(self, workspace_slug: str, api_key: str):
        """
        Initialize the Plane Project Automator
        
        Args:
            workspace_slug (str): Plane workspace identifier
            api_key (str): API key for authentication
        """
        self.workspace_slug = workspace_slug
        self.api_key = api_key
    
    def enable_project_features(self, project_id: str):
        """
        Enable key features for a project
        
        Args:
            project_id (str): UUID of the project
        """
        try:
            # Use mcporter to enable features
            features_to_enable = [
                'time_tracking:true',
                'issue_types:true',
                'modules:true',
                'intake:true'
            ]
            
            cmd = ['mcporter', 'call', 'plane.update_project_features', 
                   f'project_id:{project_id}'] + features_to_enable
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            logging.info(f"Successfully enabled features for project {project_id}")
            logging.info(f"Response: {result.stdout}")
            
        except subprocess.CalledProcessError as e:
            logging.error(f"Error enabling project features for {project_id}: {e.stderr}")
            raise
    
    def setup_work_item_views(self, project_id: str):
        """
        Create standard project views
        
        Args:
            project_id (str): UUID of the project
        """
        standard_views = [
            "This Sprint",
            "Blocked",
            "Overdue",
            "High Priority"
        ]
        
        for view_name in standard_views:
            try:
                cmd = [
                    'mcporter', 'call', 'plane.create_project_page',
                    f'project_id:{project_id}',
                    f'name:{view_name}',
                    'description_html:Automatically generated project view'
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                logging.info(f"Created view '{view_name}' for project {project_id}")
            except subprocess.CalledProcessError as e:
                logging.error(f"Failed to create view '{view_name}': {e.stderr}")
    
    def run_project_setup(self, project_id: str):
        """
        Comprehensive project setup method
        
        Args:
            project_id (str): UUID of the project
        """
        try:
            # Enable features
            self.enable_project_features(project_id)
            
            # Create standard views
            self.setup_work_item_views(project_id)
            
            logging.info(f"Completed setup for project {project_id}")
        
        except Exception as e:
            logging.error(f"Project setup failed: {e}")
            raise

def main():
    # Load configuration from environment or config file
    workspace_slug = os.environ.get('PLANE_WORKSPACE_SLUG', 'slurpnet')
    api_key = os.environ.get('PLANE_API_KEY', 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb')
    
    # Target projects (you can modify this list)
    target_projects = [
        'b7824695-65e5-4da6-ba57-3f7ac172266d',  # Plane Platform Improvements
        '3ba363f7-0d24-43e8-b2a4-d40009a91287',  # 7-inch Dashboard
        '50f92be3-a93b-42eb-8a75-6cc8de49a2e4'   # CLI Agent Capabilities
    ]
    
    automator = PlaneProjectAutomator(workspace_slug, api_key)
    
    for project_id in target_projects:
        try:
            automator.run_project_setup(project_id)
        except Exception as e:
            logging.error(f"Failed to setup project {project_id}: {e}")

if __name__ == "__main__":
    main()