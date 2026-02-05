import os
import sys
import json
import logging
import subprocess
from datetime import datetime

class PlaneMCPProjectCreator:
    def __init__(self):
        # Logging setup
        log_dir = '/Users/zachgonser/clawd/logs/plane_projects'
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f'plane_project_creation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        
        # MCP Configuration from memory
        self.mcp_config = {
            'base_url': 'http://192.168.225.149:7210',
            'workspace_slug': 'slurpnet',
            'api_key': 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb',
            'transport': 'stdio'
        }
    
    def create_project(self, name, description, source_url):
        """Create a project using Plane MCP"""
        try:
            # Prepare MCP payload
            mcp_payload = {
                'action': 'create_project',
                'workspace': self.mcp_config['workspace_slug'],
                'name': name,
                'description': f"{description}\n\nSource: {source_url}",
                'labels': ['external-inspiration', 'exploration']
            }
            
            # Set environment variables for MCP
            env = os.environ.copy()
            env.update({
                'PLANE_API_KEY': self.mcp_config['api_key'],
                'PLANE_WORKSPACE_SLUG': self.mcp_config['workspace_slug'],
                'PLANE_BASE_URL': self.mcp_config['base_url']
            })
            
            # Run MCP server via stdio
            process = subprocess.Popen(
                ['uvx', 'plane-mcp-server', 'stdio'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True
            )
            
            # Send project creation request
            stdout, stderr = process.communicate(input=json.dumps(mcp_payload))
            
            # Process response
            if process.returncode == 0:
                try:
                    response = json.loads(stdout)
                    logging.info(f"Project created successfully: {name}")
                    return response
                except json.JSONDecodeError:
                    logging.error(f"Invalid JSON response: {stdout}")
                    return None
            else:
                logging.error(f"Project creation failed: {stderr}")
                return None
        
        except Exception as e:
            logging.error(f"Error creating project {name}: {e}")
            return None
    
    def batch_create_projects(self, projects):
        """Create multiple projects in batch"""
        results = []
        for project in projects:
            result = self.create_project(
                name=project['name'],
                description=project['description'],
                source_url=project['source_url']
            )
            results.append(result)
        
        # Generate comprehensive report
        report_path = f'/Users/zachgonser/clawd/logs/plane_projects/project_creation_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2)
        
        logging.info(f"Project creation report saved: {report_path}")
        return results

def main():
    creator = PlaneMCPProjectCreator()
    
    # Define projects to create
    projects = [
        {
            'name': 'External Inspiration - Ryan Carson Tweet',
            'description': 'Exploring innovative insights from Ryan Carson\'s tweet. Requires further investigation and potential strategic implementation.',
            'source_url': 'https://x.com/ryancarson/status/2016520542723924279'
        },
        {
            'name': 'Tech Exploration - PB Teja Tweet',
            'description': 'Investigating technological concepts and potential applications from PB Teja\'s tweet. Requires deep dive and analysis.',
            'source_url': 'https://x.com/pbteja1998/status/2017662163540971756'
        },
        {
            'name': 'Innovation Tracking - Ganim Corey Tweet',
            'description': 'Monitoring emerging trends and innovative ideas highlighted in Ganim Corey\'s tweet. Needs comprehensive research and strategic assessment.',
            'source_url': 'https://x.com/GanimCorey/status/2017959821111083068'
        }
    ]
    
    # Create projects
    results = creator.batch_create_projects(projects)
    
    # Print results
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    main()