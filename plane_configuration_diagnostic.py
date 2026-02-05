import os
import sys
import json
import logging
import requests
from datetime import datetime

class PlaneConfigurationDiagnostic:
    def __init__(self):
        # Logging setup
        log_dir = '/Users/zachgonser/clawd/logs/plane_diagnostics'
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f'plane_config_diagnostic_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s: %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        
        # Potential configuration locations
        self.config_paths = [
            '/Users/zachgonser/plane-mcp-config.json',
            '/Users/zachgonser/.config/plane/config.json',
            '/Users/zachgonser/clawd/plane-mcp-config.json'
        ]
        
        # Potential server configurations
        self.server_configs = [
            {
                'base_url': 'http://192.168.225.149:7210/api',
                'workspace_slug': 'slurpnet'
            },
            {
                'base_url': 'https://plane.slurpnet.com/api',
                'workspace_slug': 'slurpnet'
            }
        ]
        
        # Authentication methods to test
        self.auth_methods = [
            {
                'type': 'Bearer Token',
                'token': 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb'
            },
            {
                'type': 'Environment Variable',
                'token': os.environ.get('PLANE_API_KEY')
            }
        ]
    
    def load_config_files(self):
        """Attempt to load configuration files"""
        configs_found = []
        for path in self.config_paths:
            try:
                with open(path, 'r') as f:
                    config = json.load(f)
                    configs_found.append({
                        'path': path,
                        'config': config
                    })
            except (FileNotFoundError, json.JSONDecodeError) as e:
                logging.warning(f"Could not load config from {path}: {e}")
        
        return configs_found
    
    def test_server_connection(self, base_url, workspace_slug, token):
        """Test connection to Plane server"""
        try:
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            # Test workspace endpoint
            response = requests.get(
                f'{base_url}/workspaces/{workspace_slug}',
                headers=headers
            )
            
            return {
                'url': base_url,
                'workspace': workspace_slug,
                'status_code': response.status_code,
                'response_text': response.text
            }
        
        except Exception as e:
            logging.error(f"Connection test failed for {base_url}: {e}")
            return {
                'url': base_url,
                'workspace': workspace_slug,
                'error': str(e)
            }
    
    def run_diagnostic(self):
        """Comprehensive Plane configuration diagnostic"""
        diagnostic_report = {
            'timestamp': datetime.now().isoformat(),
            'config_files': self.load_config_files(),
            'server_tests': []
        }
        
        # Test server configurations
        for server_config in self.server_configs:
            for auth_method in self.auth_methods:
                connection_test = self.test_server_connection(
                    server_config['base_url'],
                    server_config['workspace_slug'],
                    auth_method['token']
                )
                
                diagnostic_report['server_tests'].append({
                    'server': server_config,
                    'auth_method': auth_method,
                    'connection_test': connection_test
                })
        
        # Save diagnostic report
        report_path = f'/Users/zachgonser/clawd/logs/plane_diagnostics/plane_config_diagnostic_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        
        with open(report_path, 'w') as f:
            json.dump(diagnostic_report, f, indent=2)
        
        logging.info(f"Plane configuration diagnostic complete. Report saved: {report_path}")
        return diagnostic_report

def main():
    diagnostic = PlaneConfigurationDiagnostic()
    report = diagnostic.run_diagnostic()
    
    # Print key findings
    print("Configuration Files Found:")
    for config in report['config_files']:
        print(f"- {config['path']}")
    
    print("\nServer Connection Tests:")
    for test in report['server_tests']:
        print(f"Server: {test['server']['base_url']}")
        print(f"Auth Method: {test['auth_method']['type']}")
        print(f"Connection Result: {json.dumps(test['connection_test'], indent=2)}\n")

if __name__ == '__main__':
    main()