import sys
import os
import json
import logging
import subprocess

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

def setup_environment():
    """Explicitly set up environment variables for Plane MCP."""
    env_config = {
        'PLANE_API_KEY': 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb',
        'PLANE_WORKSPACE_SLUG': 'slurpnet',
        'PLANE_BASE_URL': 'http://192.168.225.149:7210'
    }
    
    for key, value in env_config.items():
        os.environ[key] = value
        logging.info(f"Set {key}: {value}")

def debug_package_import():
    """Comprehensive package import debugging."""
    packages_to_check = [
        'plane_mcp', 
        'plane_mcp_server', 
        'plane_sdk', 
        'fastmcp', 
        'mcp'
    ]
    
    sys.path.append('/Users/zachgonser/clawd/.venv/mcp-server/lib/python3.10/site-packages')
    
    for package in packages_to_check:
        try:
            module = __import__(package.replace('-', '_'))
            logging.info(f"Successfully imported {package}")
            logging.info(f"Module location: {module.__file__}")
        except ImportError as e:
            logging.error(f"Failed to import {package}: {e}")
        except Exception as e:
            logging.error(f"Unexpected error importing {package}: {e}")

def run_mcp_server():
    """Attempt to run the MCP server with comprehensive error handling."""
    try:
        # Use subprocess to run the MCP server with full environment
        result = subprocess.run(
            ['uvx', 'plane-mcp-server', 'stdio'],
            env=os.environ.copy(),
            capture_output=True, 
            text=True
        )
        
        logging.info("MCP Server Output:")
        logging.info(f"STDOUT: {result.stdout}")
        logging.info(f"STDERR: {result.stderr}")
        logging.info(f"Return Code: {result.returncode}")
    
    except FileNotFoundError:
        logging.error("uvx or plane-mcp-server not found. Check installation.")
    except subprocess.CalledProcessError as e:
        logging.error(f"MCP Server Execution Failed: {e}")
        logging.error(f"STDOUT: {e.stdout}")
        logging.error(f"STDERR: {e.stderr}")
    except Exception as e:
        logging.error(f"Unexpected error running MCP server: {e}")

def main():
    logging.info("🚀 Plane MCP Connection Diagnostic")
    
    setup_environment()
    debug_package_import()
    run_mcp_server()

if __name__ == "__main__":
    main()