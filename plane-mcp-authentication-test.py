import sys
import os
import logging
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

def test_plane_authentication():
    """Comprehensive authentication test for Plane MCP."""
    try:
        # Import with explicit error handling
        from plane_mcp.client import PlaneClient
        import plane.errors.errors as plane_errors
        
        logging.info("🔐 Attempting Client Authentication")
        
        # Test various authentication scenarios
        authentication_methods = [
            {"method": "API Key", "kwargs": {
                "base_url": "http://192.168.225.149:7210",
                "api_key": "plane_api_292d5a7b1b214f57b94e6e1835ae45eb"
            }},
            {"method": "Workspace + API Key", "kwargs": {
                "base_url": "http://192.168.225.149:7210",
                "api_key": "plane_api_292d5a7b1b214f57b94e6e1835ae45eb",
                "workspace_slug": "slurpnet"
            }}
        ]
        
        for scenario in authentication_methods:
            logging.info(f"\n📌 Testing: {scenario['method']}")
            try:
                client = PlaneClient(**scenario['kwargs'])
                logging.info("✅ Client Initialized Successfully")
                
                # Attempt to retrieve projects
                projects = client.list_projects()
                logging.info(f"🗂️ Retrieved {len(projects)} Projects")
                for project in projects:
                    logging.info(f"  - {project.get('name', 'Unnamed Project')}")
            
            except plane_errors.ConfigurationError as config_err:
                logging.error(f"Configuration Error: {config_err}")
            except Exception as e:
                logging.error(f"Authentication Scenario Failed: {e}")
                traceback.print_exc()
    
    except ImportError as e:
        logging.error(f"Import Error: {e}")
    except Exception as e:
        logging.error(f"Unexpected Error: {e}")
        traceback.print_exc()

def main():
    logging.info("🚀 Plane MCP Authentication Test")
    test_plane_authentication()

if __name__ == "__main__":
    main()