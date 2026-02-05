import os
import sys
import logging
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/Users/zachgonser/clawd/plane-mcp-client-verify.log')
    ]
)

def verify_mcp_connection():
    """Comprehensive MCP client verification."""
    try:
        # Import dynamically to handle potential import issues
        from plane_mcp.client import PlaneClient
        
        logging.info("🔍 Initializing Plane MCP Client")
        
        # Client initialization with explicit parameters
        client = PlaneClient(
            base_url='http://192.168.225.149:7210'
        )
        
        logging.info("✅ Client Initialized Successfully")
        
        # Retrieve projects with explicit API key
        projects = client.list_projects(
            api_key='plane_api_292d5a7b1b214f57b94e6e1835ae45eb'
        )
        
        logging.info(f"🗂️ Retrieved {len(projects)} Projects")
        
        # Detailed project logging
        for project in projects:
            logging.info(f"Project: {project.get('name', 'Unnamed')} (ID: {project.get('id', 'Unknown')})")
        
        return projects
    
    except ImportError as ie:
        logging.error(f"Import Error: {ie}")
        logging.error(traceback.format_exc())
    except Exception as e:
        logging.error(f"MCP Client Verification Failed: {e}")
        logging.error(traceback.format_exc())

def main():
    logging.info("🚀 Plane MCP Client Verification")
    projects = verify_mcp_connection()

if __name__ == "__main__":
    main()