import sys
import os
import logging
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

def diagnose_mcp_modules():
    """Comprehensive module and import diagnostics."""
    logging.info("🕵️ MCP Module Detective")
    
    # Python path and environment information
    logging.info(f"Python Executable: {sys.executable}")
    logging.info(f"Python Version: {sys.version}")
    logging.info("Python Path:")
    for path in sys.path:
        logging.info(f"  {path}")
    
    # Modules to check
    modules_to_check = [
        'plane_mcp',
        'plane_mcp.client',
        'plane_sdk',
        'fastmcp',
        'mcp'
    ]
    
    for module_name in modules_to_check:
        try:
            module = __import__(module_name.replace('-', '_'))
            logging.info(f"✅ Successfully imported: {module_name}")
            logging.info(f"  Location: {module.__file__}")
            
            # Additional version information if available
            version = getattr(module, '__version__', 'No version attribute')
            logging.info(f"  Version: {version}")
        
        except ImportError as e:
            logging.error(f"❌ Import Error: {module_name}")
            logging.error(str(e))
        except Exception as e:
            logging.error(f"❌ Unexpected Error with {module_name}")
            logging.error(str(e))

def main():
    logging.info("🔍 MCP Module Diagnostic")
    diagnose_mcp_modules()

if __name__ == "__main__":
    main()