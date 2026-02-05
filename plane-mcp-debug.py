import sys
import importlib
import pkg_resources
import json

def main():
    print("Python Path:", sys.path)
    
    print("\nInstalled Packages:")
    for dist in pkg_resources.working_set:
        print(f"{dist.key}: {dist.version}")
    
    print("\nAttempting to import Plane MCP modules:")
    modules_to_try = [
        'plane_mcp', 
        'plane_mcp_server', 
        'plane.mcp', 
        'plane_sdk',
        'fastmcp'
    ]
    
    for module_name in modules_to_try:
        try:
            module = importlib.import_module(module_name)
            print(f"\nSuccessfully imported {module_name}")
            print("Module location:", module.__file__)
            
            # Try to print version (if available)
            try:
                version = getattr(module, '__version__', 'No version attribute')
                print(f"Version: {version}")
            except Exception as version_err:
                print(f"Version check error: {version_err}")
        
        except ImportError as e:
            print(f"Could not import {module_name}: {e}")

    # List available tools/methods
    print("\nAvailable Tools Check:")
    try:
        from plane_mcp_server import list_methods
        print("Available Methods:", list_methods())
    except Exception as e:
        print("Could not list methods:", e)

if __name__ == "__main__":
    main()