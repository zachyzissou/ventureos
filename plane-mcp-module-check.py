import sys
import logging
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

def check_plane_modules():
    """Comprehensive module and import checking."""
    modules_to_check = [
        'plane_mcp',
        'plane_mcp.client',
        'plane_mcp.server',
        'plane.client.plane_client',
        'plane.errors.errors',
        'plane_sdk'
    ]
    
    for module_name in modules_to_check:
        try:
            module = __import__(module_name, fromlist=['*'])
            logging.info(f"✅ Successfully imported: {module_name}")
            logging.info(f"  Location: {module.__file__}")
            
            # Additional introspection if possible
            if hasattr(module, '__version__'):
                logging.info(f"  Version: {module.__version__}")
        
        except ImportError as e:
            logging.error(f"❌ Import Error: {module_name}")
            logging.error(str(e))
        except Exception as e:
            logging.error(f"❌ Unexpected Error with {module_name}")
            logging.error(str(e))

def main():
    logging.info("🕵️ Plane MCP Module Detective")
    check_plane_modules()

if __name__ == "__main__":
    main()