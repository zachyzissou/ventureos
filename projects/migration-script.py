import requests
import base64
import os

class PlaneMigrator:
    def __init__(self, openproject_url, api_key):
        self.base_url = openproject_url
        self.headers = {
            'Authorization': f'Basic {base64.b64encode(f"apikey:{api_key}".encode()).decode()}',
            'Content-Type': 'application/json'
        }
        self.project_id = 15  # Plane to OpenProject Migration project
    
    def create_work_package(self, subject, description, type_id=1, parent_id=None):
        payload = {
            'subject': subject,
            'description': {
                'format': 'markdown',
                'raw': description
            },
            '_links': {
                'type': {'href': f'/api/v3/types/{type_id}'},
                'project': {'href': f'/api/v3/projects/{self.project_id}'}
            }
        }
        
        if parent_id:
            payload['_links']['parent'] = {'href': f'/api/v3/work_packages/{parent_id}'}
        
        response = requests.post(
            f'{self.base_url}/api/v3/work_packages', 
            headers=self.headers, 
            json=payload
        )
        
        print(f"Creating work package: {subject}")
        print(f"Response: {response.text}")
        
        if response.status_code in [200, 201]:
            return response.json()['id']
        else:
            print(f"Error creating work package: {response.text}")
            return None

def main():
    migrator = PlaneMigrator(
        openproject_url='http://localhost:59002', 
        api_key='bd537315328f9a7ceae72161dd55fa28711a7b7840d0c5357aa8d11163c672a6'
    )
    
    # Master Work Packages
    master_plan_id = migrator.create_work_package(
        "Migration Master Plan", 
        """# Comprehensive Strategy for Full Project and Content Migration from Plane to OpenProject

## Objectives
1. Complete transfer of 10 projects
2. Preserve all project metadata
3. Maintain project relationships and hierarchies
4. Ensure zero data loss
5. Validate migration accuracy

## Projects to Migrate
1. Stanton Times
2. Innovation Tracking - Ganim Corey
3. Tech Exploration - PB Teja
4. External Inspiration - Ryan Carson
5. Plane Platform Improvements
6. 7-inch Dashboard
7. CLI Agent Capabilities
8. Queue Management System
9. SlurpNet Ops & Knowledge
10. Clawdbot Autonomy Infrastructure""",
        type_id=1  # Task type
    )
    
    # Phases
    preparation_phase_id = migrator.create_work_package(
        "Preparation Phase", 
        """## Pre-migration preparation and planning
- Complete full content inventory
- Map Plane project structures
- Develop migration scripts
- Set up migration logging
- Prepare validation checkpoints""",
        type_id=3,  # Phase
        parent_id=master_plan_id
    )
    
    migration_execution_id = migrator.create_work_package(
        "Migration Execution", 
        """## Systematic migration of projects
- Transfer project metadata
- Migrate work items and tasks
- Preserve creation dates and authorship
- Maintain project hierarchies
- Ensure data integrity""",
        type_id=3,  # Phase
        parent_id=master_plan_id
    )
    
    validation_phase_id = migrator.create_work_package(
        "Validation and Verification", 
        """## Comprehensive migration validation
- Verify 100% data transfer
- Check feature parity
- Test integrations
- Validate user permissions
- Performance assessment""",
        type_id=3,  # Phase
        parent_id=master_plan_id
    )
    
    # Detailed Work Packages for Each Phase
    migrator.create_work_package(
        "Content Inventory and Mapping", 
        "Detailed inventory of all projects, their structures, and metadata",
        parent_id=preparation_phase_id
    )
    
    migrator.create_work_package(
        "Migration Script Development", 
        "Create robust scripts for transferring project data",
        parent_id=preparation_phase_id
    )
    
    migrator.create_work_package(
        "Project-Specific Migration Scripts", 
        "Develop custom migration approaches for unique project requirements",
        parent_id=migration_execution_id
    )
    
    migrator.create_work_package(
        "Data Integrity Checks", 
        "Implement comprehensive validation mechanisms",
        parent_id=validation_phase_id
    )

if __name__ == '__main__':
    main()