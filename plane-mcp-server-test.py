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

def test_mcp_server():
    """Test Plane MCP server capabilities."""
    try:
        import plane_mcp.server as mcp_server
        import plane_mcp.client as mcp_client
        
        # List available methods/tools
        logging.info("MCP Server Methods:")
        if hasattr(mcp_server, 'list_methods'):
            methods = mcp_server.list_methods()
            for method in methods:
                logging.info(f"  - {method}")
        
        # Test client connection
        client = mcp_client.PlaneClient()
        logging.info("Client initialized successfully")
        
        # Attempt to list projects
        projects = client.list_projects()
        logging.info("Available Projects:")
        for project in projects:
            logging.info(f"  - {project['name']} (ID: {project['id']})")
    
    except ImportError as e:
        logging.error(f"Import Error: {e}")
    except Exception as e:
        logging.error(f"Unexpected Error: {e}")

def main():
    logging.info("🚀 Plane MCP Server Test")
    test_mcp_server()

if __name__ == "__main__":
    main()