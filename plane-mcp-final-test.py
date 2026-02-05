import sys
import os
import logging
import json

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

# Set environment variables
os.environ['PLANE_API_KEY'] = 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb'
os.environ['PLANE_WORKSPACE_SLUG'] = 'slurpnet'
os.environ['PLANE_BASE_URL'] = 'http://192.168.225.149:7210'

def test_mcp_client():
    """Comprehensive Plane MCP client test."""
    try:
        from plane_mcp.client import PlaneClient
        
        # Initialize client
        client = PlaneClient(base_url='http://192.168.225.149:7210')
        
        logging.info("Client initialized successfully")
        
        # Retrieve available methods
        logging.info("Available Client Methods:")
        methods = [method for method in dir(client) if not method.startswith('_')]
        for method in methods:
            logging.info(f"  - {method}")
        
        # Attempt to list projects
        logging.info("\nRetrieving Projects:")
        projects = client.list_projects(api_key='plane_api_292d5a7b1b214f57b94e6e1835ae45eb')
        
        logging.info(f"Found {len(projects)} projects")
        for project in projects:
            logging.info(f"Project: {json.dumps(project, indent=2)}")
    
    except ImportError as e:
        logging.error(f"Import Error: {e}")
    except Exception as e:
        logging.error(f"Unexpected Error: {e}")
        import traceback
        traceback.print_exc()

def main():
    logging.info("🚀 Plane MCP Final Client Test")
    test_mcp_client()

if __name__ == "__main__":
    main()