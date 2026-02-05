import os
import sys
import logging
import subprocess

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/Users/zachgonser/clawd/plane-mcp-launch.log')
    ]
)

def setup_environment():
    """Set up environment variables for Plane MCP server."""
    env_config = {
        'PLANE_BASE_URL': 'http://192.168.225.149:7210',
        'PLANE_API_KEY': 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb',
        'PLANE_WORKSPACE_SLUG': 'slurpnet'
    }
    
    for key, value in env_config.items():
        os.environ[key] = value
        logging.info(f"Set {key}: {value}")

def check_dependencies():
    """Verify required dependencies are installed."""
    dependencies = ['uvx', 'plane-mcp-server']
    
    for dep in dependencies:
        try:
            subprocess.run(
                [dep, '--version'], 
                capture_output=True, 
                text=True, 
                check=True
            )
            logging.info(f"✅ {dep} is installed")
        except subprocess.CalledProcessError:
            logging.warning(f"❌ {dep} version check failed")
        except FileNotFoundError:
            logging.error(f"❌ {dep} not found")
            return False
    
    return True

def launch_mcp_server():
    """Launch the Plane MCP server with comprehensive error handling."""
    try:
        logging.info("🚀 Launching Plane MCP Server")
        
        # Use subprocess to launch with full environment
        process = subprocess.Popen(
            ['uvx', 'plane-mcp-server', 'stdio'],
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Stream output in real-time
        while True:
            stdout_line = process.stdout.readline()
            stderr_line = process.stderr.readline()
            
            if stdout_line:
                logging.info(f"STDOUT: {stdout_line.strip()}")
            if stderr_line:
                logging.error(f"STDERR: {stderr_line.strip()}")
            
            # Check if process has terminated
            if process.poll() is not None:
                break
        
        # Check final return code
        if process.returncode != 0:
            logging.error(f"❌ MCP Server exited with code {process.returncode}")
        else:
            logging.info("✅ MCP Server completed successfully")
    
    except Exception as e:
        logging.error(f"❌ MCP Server Launch Failed: {e}")
        logging.error(traceback.format_exc())

def main():
    setup_environment()
    if check_dependencies():
        launch_mcp_server()
    else:
        logging.error("❌ Dependency check failed. Cannot launch MCP server.")

if __name__ == "__main__":
    main()