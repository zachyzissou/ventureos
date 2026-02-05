import os
import json
import subprocess
import sys
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Explicitly set the virtual environment path
VENV_PATH = '/Users/zachgonser/clawd/plane-mcp-server/.venv/bin'

# Read the MCP configuration
with open('/Users/zachgonser/clawd/plane-mcp-config.json', 'r') as f:
    config = json.load(f)

# Extract the configuration for the Plane MCP server
plane_config = config['mcpServers']['plane']

# Set environment variables with explicit PATH
env = os.environ.copy()
env['PATH'] = f'{VENV_PATH}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:' + env.get('PATH', '')
env['PYTHONUNBUFFERED'] = '1'  # Force unbuffered output
env['PYTHONPATH'] = VENV_PATH  # Ensure Python can find modules

# Add Plane-specific environment variables
for key, value in plane_config.get('env', {}).items():
    env[key] = str(value)

# Prepare the command with full path to the script in virtual environment
command = [os.path.join(VENV_PATH, 'python3'), '-m', 'plane_mcp', 'stdio']

logger.info(f"Executing command: {' '.join(command)}")
logger.info(f"Environment PATH: {env['PATH']}")
logger.info(f"Environment Variables: {json.dumps(plane_config.get('env', {}), indent=2)}")

# Run the command
try:
    result = subprocess.run(
        command, 
        capture_output=True, 
        text=True, 
        env=env,
        timeout=30,  # Add a timeout to prevent hanging
        check=True
    )
    
    logger.info("\nSTDOUT:")
    logger.info(result.stdout)
    
    logger.info("\nSTDERR:")
    logger.info(result.stderr)

except subprocess.TimeoutExpired:
    logger.error("Command timed out")
except subprocess.CalledProcessError as e:
    logger.error("\nCommand failed:")
    logger.error(f"STDOUT: {e.stdout}")
    logger.error(f"STDERR: {e.stderr}")
    logger.error(f"Return Code: {e.returncode}")
    raise
except Exception as e:
    logger.error("\nUnexpected error:")
    logger.error(str(e))
    raise