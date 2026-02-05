import os
import requests
import json
import base64
import logging
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('/Users/zachgonser/clawd/migration_log.txt'),
        logging.StreamHandler()
    ]
)

# Plane and OpenProject configuration
PLANE_PROJECTS = [
    {
        "id": "de035243-4d44-44cf-ad37-0c10b4208a7d",
        "name": "Stanton Times",
        "description": "Autonomous content monitoring and publishing system for Star Citizen news",
        "identifier": "STANTON"
    },
    {
        "id": "3f715a20-4c54-4292-9943-77dca0c286e4",
        "name": "Innovation Tracking - Ganim Corey",
        "description": "Monitoring emerging trends and innovative ideas highlighted in Ganim Corey's tweet. Needs comprehensive research and strategic assessment.\n\nSource: https://x.com/GanimCorey/status/2017959821111083068",
        "identifier": "GANIM"
    },
    {
        "id": "5173ed8a-642e-4178-a220-9960f826c661",
        "name": "Tech Exploration - PB Teja",
        "description": "Investigating technological concepts and potential applications from PB Teja's tweet. Requires deep dive and analysis.\n\nSource: https://x.com/pbteja1998/status/2017662163540971756",
        "identifier": "PBTEJ"
    },
    {
        "id": "96c9b1b1-1535-4fe3-b28b-4350c3684844",
        "name": "External Inspiration - Ryan Carson",
        "description": "Exploring innovative insights from Ryan Carson's tweet. Requires further investigation and potential strategic implementation.\n\nSource: https://x.com/ryancarson/status/2016520542723924279",
        "identifier": "RYANC"
    },
    {
        "id": "b7824695-65e5-4da6-ba57-3f7ac172266d",
        "name": "Plane Platform Improvements",
        "description": "Feature enablement + workflow standardization across the Plane instance.",
        "identifier": "PLANE"
    },
    {
        "id": "3ba363f7-0d24-43e8-b2a4-d40009a91287",
        "name": "7-inch Dashboard",
        "description": "7-inch monitor dashboard (TUI + app-style concepts). Real-time status, alerts, and glanceable metrics.",
        "identifier": "DASH"
    },
    {
        "id": "50f92be3-a93b-42eb-8a75-6cc8de49a2e4",
        "name": "CLI Agent Capabilities",
        "description": "Expand CLI agent capabilities across Codex/Gemini/Cursor: terminal interaction, capability matrix, routing policy, and workflow library.",
        "identifier": "CLI"
    },
    {
        "id": "3fde0f58-175e-4235-9f3f-933ec7776937",
        "name": "Queue Management System",
        "description": "Build a scalable, resilient distributed queue management system with multi-agent support. Phases: (1) Foundation: core queue manager, error handling, agent registry. (2) Advanced Routing: intelligent job routing, prioritization, performance tracking. (3) Distributed Infrastructure: persistence, cross-node coordination, exactly-once processing. (4) Advanced Features: ML optimization, observability, security. Next steps: finalize specs, set up env, PoC, start Phase 1.",
        "identifier": "QMS"
    },
    {
        "id": "d9864c6c-4878-4439-8822-bbb8d1f07364",
        "name": "SlurpNet Ops & Knowledge",
        "description": "Operations + knowledge base for Unraid/SlurpNet. Track infrastructure, automation, monitoring, and documentation.",
        "identifier": "SLURP"
    },
    {
        "id": "ee9b9bdb-0300-4b7e-a8f8-e7da904a62aa",
        "name": "Clawdbot Autonomy Infrastructure",
        "description": "Validation loops and infrastructure components for Clawdbot system. Auto-fix before escalating, phase tracking, proactive monitoring.",
        "identifier": "CLAWDBOTAU"
    }
]

OPENPROJECT_URL = os.environ.get('OPENPROJECT_URL', 'http://localhost:59002')
OPENPROJECT_API_KEY = os.environ.get('OPENPROJECT_API_KEY')

class PlaneMigrator:
    def __init__(self):
        # OpenProject API setup
        self.op_headers = {
            'Authorization': f'Basic {base64.b64encode(f"apikey:{OPENPROJECT_API_KEY}".encode()).decode()}',
            'Content-Type': 'application/json'
        }
        
        # Mapping to track migrated entities
        self.project_id_map = {}
        self.user_id_map = {}
        self.work_package_id_map = {}

    def sanitize_identifier(self, identifier):
        """Sanitize project identifier to meet OpenProject requirements"""
        # Convert to lowercase
        identifier = identifier.lower()
        
        # Remove non-alphanumeric characters, replace with hyphen
        identifier = re.sub(r'[^a-z0-9]+', '-', identifier)
        
        # Trim to max 255 characters
        identifier = identifier[:255]
        
        # Ensure it starts and ends with alphanumeric character
        identifier = identifier.strip('-')
        
        return identifier

    def migrate_projects(self):
        """Migrate projects from predefined list to OpenProject"""
        logging.info("Starting project migration")
        
        if not PLANE_PROJECTS:
            logging.warning("No projects found to migrate")
            return
        
        for project in PLANE_PROJECTS:
            # Sanitize identifier
            safe_identifier = self.sanitize_identifier(project.get('identifier', project['name']))
            
            # Create project in OpenProject
            op_project_payload = {
                'name': project.get('name', 'Unnamed Project'),
                'identifier': safe_identifier,
                'description': {
                    'format': 'markdown',
                    'raw': project.get('description', '')
                }
            }
            
            try:
                op_project_response = requests.post(
                    f'{OPENPROJECT_URL}/api/v3/projects', 
                    headers=self.op_headers, 
                    json=op_project_payload
                )
                op_project_response.raise_for_status()
                
                # Store mapping between Plane and OpenProject project IDs
                op_project_data = op_project_response.json()
                self.project_id_map[project['id']] = op_project_data['id']
                
                logging.info(f"Migrated project: {project['name']} (ID: {op_project_data['id']})")
            
            except Exception as e:
                logging.error(f"Failed to migrate project {project['name']}: {e}")

    def full_migration(self):
        """Perform full migration of Plane data to OpenProject"""
        logging.info("Starting full Plane to OpenProject migration")
        
        # Validate API key
        if not OPENPROJECT_API_KEY:
            logging.error("Missing API key for OpenProject")
            return
        
        # Migration steps
        self.migrate_projects()
        
        # Save migration mapping for potential future reference
        migration_map = {
            'project_id_map': self.project_id_map
        }
        
        with open('/Users/zachgonser/clawd/migration_mapping.json', 'w') as f:
            json.dump(migration_map, f, indent=2)
        
        logging.info("Migration completed")

def main():
    migrator = PlaneMigrator()
    migrator.full_migration()

if __name__ == '__main__':
    main()