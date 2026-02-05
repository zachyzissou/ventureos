import os
import sys
import json
from datetime import datetime

class PlaneProjectCreator:
    def __init__(self):
        # Workspace details from previous configurations
        self.workspace = 'slurpnet'
    
    def create_projects(self, projects):
        """Create projects and return results"""
        results = []
        for project in projects:
            project_details = {
                'name': project['name'],
                'description': f"{project['description']}\n\nSource: {project['source_url']}",
                'labels': ['external-inspiration', 'exploration']
            }
            results.append(project_details)
        
        # Save project details for tracking
        report_path = f'/Users/zachgonser/clawd/logs/plane_projects/project_creation_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2)
        
        return results

def main():
    creator = PlaneProjectCreator()
    
    # Projects to create
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
    results = creator.create_projects(projects)
    
    # Print results
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    main()