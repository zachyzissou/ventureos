import sys
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

# Set environment variables
os.environ['PLANE_API_KEY'] = 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb'
os.environ['PLANE_WORKSPACE_SLUG'] = 'slurpnet'
os.environ['PLANE_BASE_URL'] = 'http://192.168.225.149:7210'

def test_mcp_client():
    """Test Plane MCP client capabilities."""
    try:
        from plane_mcp.client import PlaneClient
        
        # Initialize client with explicit configuration
        client = PlaneClient(
            base_url='http://192.168.225.149:7210',
            api_key='plane_api_292d5a7b1b214f57b94e6e1835ae45eb',
            workspace_slug='slurpnet'
        )
        
        logging.info("Client initialized successfully")
        
        # Retrieve available methods
        logging.info("Available Client Methods:")
        for method in dir(client):
            if not method.startswith('_'):
                logging.info(f"  - {method}")
        
        # Attempt to list projects
        logging.info("\nRetrieving Projects:")
        projects = client.list_projects()
        
        for project in projects:
            logging.info(f"Project: {project.get('name', 'Unnamed')} (ID: {project.get('id', 'Unknown')})")
    
    except ImportError as e:
        logging.error(f"Import Error: {e}")
    except Exception as e:
        logging.error(f"Unexpected Error: {e}")

def main():
    logging.info("🚀 Plane MCP Client Test")
    test_mcp_client()

if __name__ == "__main__":
    main()