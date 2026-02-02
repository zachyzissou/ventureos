#!/usr/bin/env python3
import os
import json
import logging
import subprocess

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    filename='/Users/zachgonser/clawd/plane_project_automation.log')

def load_config(config_path):
    """Load configuration from JSON file"""
    with open(config_path, 'r') as f:
        return json.load(f)

def create_project_views(project_id, views):
    """Create standard project views"""
    for view_name in views:
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
            logging.error(f"Failed to create view '{view_name}' for project {project_id}: {e.stderr}")

def update_project_features(project_id, features):
    """Update project features"""
    try:
        # Construct mcporter call dynamically based on features
        cmd = ['mcporter', 'call', 'plane.update_project_features', f'project_id:{project_id}']
        
        for feature in features:
            cmd.append(f'{feature}:true')
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        logging.info(f"Updated features for project {project_id}: {features}")
        logging.info(f"Response: {result.stdout}")
    
    except subprocess.CalledProcessError as e:
        logging.error(f"Failed to update features for project {project_id}: {e.stderr}")

def main():
    # Load configuration
    config_path = os.path.join(os.path.dirname(__file__), 'plane-project-automation.json')
    config = load_config(config_path)
    
    # Process each project
    for project in config['target_projects']:
        try:
            # Update project features
            update_project_features(project['id'], project['features'])
            
            # Create project views
            create_project_views(project['id'], config['views'])
            
            logging.info(f"Completed setup for project {project['name']} ({project['id']})")
        
        except Exception as e:
            logging.error(f"Failed to setup project {project['name']}: {e}")
    
    # Log completion
    logging.info("Plane project automation script completed")

if __name__ == "__main__":
    main()