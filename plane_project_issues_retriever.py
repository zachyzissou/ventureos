import requests
import os
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s',
                    filename='/Users/zachgonser/clawd/plane_project_issues_retriever.log')

# Plane API configuration
API_KEY = os.environ.get('PLANE_API_KEY', 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb')
BASE_URL = 'http://192.168.225.149:7210/slurpnet/api'
PROJECT_ID = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
WORKSPACE_SLUG = 'slurpnet'

# Headers for authentication
headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

def get_project_issues():
    url = f'{BASE_URL}/workspaces/{WORKSPACE_SLUG}/projects/{PROJECT_ID}/issues/'
    
    try:
        logging.info(f"Attempting to retrieve issues for project: {PROJECT_ID}")
        response = requests.get(url, headers=headers)
        
        # Log full response for debugging
        logging.info(f"Response status code: {response.status_code}")
        logging.info(f"Response headers: {response.headers}")
        
        # Add more detailed error handling
        if response.status_code != 200:
            logging.error(f"HTTP Error: {response.status_code}")
            logging.error(f"Response content: {response.text}")
            return {'error': f'HTTP Error {response.status_code}', 'details': response.text}
        
        try:
            issues = response.json()
        except json.JSONDecodeError as je:
            logging.error(f"JSON Decode Error: {je}")
            logging.error(f"Response text: {response.text}")
            return {'error': 'Could not parse JSON response', 'details': response.text}
        
        # Filter and organize issues
        organized_issues = {
            'total_issues': len(issues),
            'issues_by_state': {},
            'issues_list': []
        }
        
        for issue in issues:
            state = issue.get('state', 'Unknown')
            if state not in organized_issues['issues_by_state']:
                organized_issues['issues_by_state'][state] = []
            
            organized_issues['issues_by_state'][state].append({
                'id': issue.get('id'),
                'name': issue.get('name'),
                'description': issue.get('description', ''),
                'priority': issue.get('priority', 'Not Set')
            })
            
            organized_issues['issues_list'].append({
                'id': issue.get('id'),
                'name': issue.get('name'),
                'state': state
            })
        
        logging.info(f"Successfully retrieved {len(issues)} issues")
        return organized_issues
    
    except requests.exceptions.RequestException as e:
        logging.error(f"Request Exception: {e}")
        return {'error': str(e)}
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        return {'error': f'Unexpected error: {str(e)}'}

# Execute and print results
if __name__ == '__main__':
    results = get_project_issues()
    print(json.dumps(results, indent=2))