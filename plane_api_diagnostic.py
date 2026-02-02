import requests
import os

# Plane API configuration
API_KEY = os.environ.get('PLANE_API_KEY', 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb')
BASE_URL = 'http://192.168.225.149:7210/slurpnet'
PROJECT_ID = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
WORKSPACE_SLUG = 'slurpnet'

# Different possible endpoint variations
endpoints = [
    f'{BASE_URL}/api/workspaces/{WORKSPACE_SLUG}/projects/{PROJECT_ID}/issues/',
    f'{BASE_URL}/api/projects/{PROJECT_ID}/issues/',
    f'{BASE_URL}/api/issues/?project={PROJECT_ID}',
    f'{BASE_URL}/api/issues/',
    f'{BASE_URL}/projects/{PROJECT_ID}/issues/'
]

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
}

def test_endpoints():
    print("🔍 Plane API Diagnostic Tool 🔍")
    print("Testing multiple possible API endpoints...\n")
    
    for endpoint in endpoints:
        print(f"Testing endpoint: {endpoint}")
        try:
            response = requests.get(endpoint, headers=headers, timeout=10)
            print(f"Status Code: {response.status_code}")
            print(f"Content Type: {response.headers.get('Content-Type', 'Unknown')}")
            print(f"Response Length: {len(response.text)} characters")
            
            if 'application/json' in response.headers.get('Content-Type', '').lower():
                try:
                    data = response.json()
                    print(f"JSON Structure: {'Dict' if isinstance(data, dict) else 'List'}")
                    print(f"JSON Keys/Length: {list(data.keys()) if isinstance(data, dict) else len(data)}")
                except ValueError:
                    print("❌ JSON Parsing Failed")
            else:
                print("❌ Non-JSON Response")
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Request Error: {e}")
        
        print("-" * 50)

if __name__ == '__main__':
    test_endpoints()