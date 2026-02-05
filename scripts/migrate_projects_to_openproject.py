#!/usr/bin/env python3
import os
import sys
import json
import logging
from datetime import datetime
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('/Users/zachgonser/clawd/logs/plane_to_openproject_migration.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

class PlaneMigration:
    def __init__(self, plane_api_key, openproject_url):
        self.plane_api_key = plane_api_key
        self.openproject_url = openproject_url
        self.projects_to_migrate = [
            "Stanton Times",
            "Innovation Tracking - Ganim Corey",
            "Tech Exploration - PB Teja",
            "External Inspiration - Ryan Carson",
            "Plane Platform Improvements",
            "7-inch Dashboard",
            "CLI Agent Capabilities",
            "Queue Management System",
            "SlurpNet Ops & Knowledge",
            "Clawdbot Autonomy Infrastructure"
        ]
        
        self.plane_headers = {
            'Authorization': f'Token {plane_api_key}',
            'Content-Type': 'application/json'
        }
        
        self.openproject_headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Basic <your_openproject_auth_token>'  # Replace with actual auth
        }

    def extract_plane_projects(self):
        """Extract project details from Plane"""
        projects_data = {}
        for project_name in self.projects_to_migrate:
            try:
                # Implement Plane API call to fetch project details
                response = requests.get(
                    f'http://192.168.225.149:7210/api/projects/{project_name}', 
                    headers=self.plane_headers
                )
                projects_data[project_name] = response.json()
                logging.info(f"Extracted data for project: {project_name}")
            except Exception as e:
                logging.error(f"Failed to extract {project_name}: {e}")
        
        return projects_data

    def transform_project_data(self, plane_project_data):
        """Transform Plane project data to OpenProject format"""
        transformed_data = {}
        for name, data in plane_project_data.items():
            transformed_project = {
                'name': name,
                'identifier': name.replace(' ', '-').lower(),
                'description': data.get('description', ''),
                'work_items': self._transform_work_items(data.get('work_items', []))
            }
            transformed_data[name] = transformed_project
        return transformed_data

    def _transform_work_items(self, work_items):
        """Transform work items to OpenProject format"""
        return [
            {
                'subject': item.get('name', ''),
                'description': item.get('description', ''),
                'status': self._map_status(item.get('status', '')),
                'priority': self._map_priority(item.get('priority', ''))
            } for item in work_items
        ]

    def _map_status(self, plane_status):
        """Map Plane statuses to OpenProject statuses"""
        status_map = {
            'Backlog': 'New',
            'In Progress': 'In Progress',
            'Done': 'Closed'
        }
        return status_map.get(plane_status, 'New')

    def _map_priority(self, plane_priority):
        """Map Plane priorities to OpenProject priorities"""
        priority_map = {
            'High': 'High',
            'Medium': 'Medium',
            'Low': 'Low'
        }
        return priority_map.get(plane_priority, 'Low')

    def import_to_openproject(self, transformed_data):
        """Import transformed data to OpenProject"""
        migration_report = {}
        for project_name, project_data in transformed_data.items():
            try:
                # Implement OpenProject project and work item creation
                response = requests.post(
                    f'{self.openproject_url}/api/v3/projects', 
                    headers=self.openproject_headers,
                    json={
                        'name': project_data['name'],
                        'identifier': project_data['identifier'],
                        'description': project_data['description']
                    }
                )
                project_id = response.json().get('id')
                
                # Create work items
                work_items_created = 0
                for work_item in project_data['work_items']:
                    work_item_response = requests.post(
                        f'{self.openproject_url}/api/v3/projects/{project_id}/work_packages',
                        headers=self.openproject_headers,
                        json=work_item
                    )
                    if work_item_response.status_code == 201:
                        work_items_created += 1
                
                migration_report[project_name] = {
                    'status': 'Success',
                    'project_id': project_id,
                    'work_items_created': work_items_created
                }
                logging.info(f"Migrated project: {project_name}")
            
            except Exception as e:
                migration_report[project_name] = {
                    'status': 'Failed',
                    'error': str(e)
                }
                logging.error(f"Migration failed for {project_name}: {e}")
        
        return migration_report

    def execute_migration(self):
        """Execute full migration process"""
        logging.info("Starting Plane to OpenProject Migration")
        
        # Load Plane API key
        with open('/Users/zachgonser/.credentials/plane_api_key', 'r') as f:
            self.plane_api_key = f.read().strip()
        
        # Migration steps
        plane_project_data = self.extract_plane_projects()
        transformed_data = self.transform_project_data(plane_project_data)
        migration_report = self.import_to_openproject(transformed_data)
        
        # Save migration report
        report_path = f'/Users/zachgonser/clawd/logs/migration_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        with open(report_path, 'w') as f:
            json.dump(migration_report, f, indent=2)
        
        logging.info(f"Migration complete. Report saved to {report_path}")
        return migration_report

def main():
    migration = PlaneMigration(
        plane_api_key=None,  # Will be loaded in method
        openproject_url='http://localhost:59002'
    )
    migration.execute_migration()

if __name__ == '__main__':
    main()