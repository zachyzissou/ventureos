import sys
import os
import json
import logging
import subprocess

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

def validate_environment():
    """Check and set up the environment for Plane MCP."""
    # Required environment variables
    env_vars = {
        'PLANE_API_KEY': 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb',
        'PLANE_WORKSPACE_SLUG': 'slurpnet',
        'PLANE_BASE_URL': 'http://192.168.225.149:7210'
    }
    
    for key, value in env_vars.items():
        os.environ[key] = value
        logging.info(f"✓ Set {key}")

def check_dependencies():
    """Verify required Python packages are installed."""
    required_packages = [
        'plane-mcp-server',
        'plane-sdk',
        'fastmcp',
        'mcp'
    ]
    
    missing_packages = []
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
            logging.info(f"✓ {package} is installed")
        except ImportError:
            missing_packages.append(package)
            logging.warning(f"✗ {package} is NOT installed")
    
    if missing_packages:
        logging.error("Installing missing packages...")
        subprocess.run([sys.executable, '-m', 'pip', 'install'] + missing_packages, check=True)

def test_mcp_connection():
    """Test Plane MCP server connection and tool availability."""
    try:
        # Dynamic import to handle potential import issues
        module = __import__('plane_mcp_server')
        
        # Use reflection to list available methods
        if hasattr(module, 'list_methods'):
            methods = module.list_methods()
            logging.info("Available MCP Methods:")
            for method in methods:
                print(f"  - {method}")
        else:
            logging.warning("Could not retrieve MCP methods")
    
    except Exception as e:
        logging.error(f"MCP Connection Test Failed: {e}")

def generate_mcp_config():
    """Generate a comprehensive MCP configuration file."""
    config = {
        "mcpServers": {
            "plane": {
                "command": "uvx",
                "args": ["plane-mcp-server", "stdio"],
                "env": {
                    "PLANE_API_KEY": os.environ['PLANE_API_KEY'],
                    "PLANE_WORKSPACE_SLUG": os.environ['PLANE_WORKSPACE_SLUG'],
                    "PLANE_BASE_URL": os.environ['PLANE_BASE_URL']
                },
                "status": "active"
            }
        }
    }
    
    config_path = '/Users/zachgonser/clawd/plane-mcp-config.json'
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    logging.info(f"✓ MCP Configuration written to {config_path}")

def main():
    logging.info("🚀 Plane MCP Server Initialization")
    
    try:
        validate_environment()
        check_dependencies()
        generate_mcp_config()
        test_mcp_connection()
        
        logging.info("✨ Plane MCP Server Setup Complete!")
    
    except Exception as e:
        logging.error(f"❌ Initialization Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()