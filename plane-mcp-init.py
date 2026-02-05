import os
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

def load_mcp_config():
    """Load and validate MCP configuration."""
    config_path = '/Users/zachgonser/clawd/plane-mcp-config.json'
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Validate essential configuration
        plane_config = config['mcpServers']['plane']
        
        # Set environment variables from configuration
        env_vars = plane_config.get('env', {})
        for key, value in env_vars.items():
            if value is not None:
                os.environ[key] = str(value)
                logging.info(f"Set {key}: {value}")
        
        logging.info("✅ MCP Configuration loaded successfully")
        return config
    
    except Exception as e:
        logging.error(f"❌ Configuration load failed: {e}")
        raise

def validate_mcp_connection():
    """Validate MCP connection capabilities."""
    try:
        from plane_mcp.client import PlaneClient
        
        client = PlaneClient(base_url=os.environ.get('PLANE_BASE_URL'))
        
        # Attempt to list projects
        projects = client.list_projects(
            api_key=os.environ.get('PLANE_API_KEY')
        )
        
        logging.info(f"🗂️ Successfully retrieved {len(projects)} projects")
        return projects
    
    except ImportError as ie:
        logging.error(f"Import Error: {ie}")
    except Exception as e:
        logging.error(f"Connection Validation Error: {e}")

def main():
    logging.info("🚀 Plane MCP Initialization")
    config = load_mcp_config()
    projects = validate_mcp_connection()

if __name__ == "__main__":
    main()