import sys
import importlib
import pkg_resources

print("Python Path:", sys.path)
print("\nInstalled Packages:")
for dist in pkg_resources.working_set:
    print(f"{dist.key}: {dist.version}")

print("\nAttempting to import:")
try:
    import plane_mcp
    print("Successfully imported plane_mcp")
    print("plane_mcp location:", plane_mcp.__file__)
except ImportError as e:
    print(f"Import Error: {e}")
    
try:
    spec = importlib.util.find_spec('plane_mcp')
    print("Module spec:", spec)
except Exception as e:
    print(f"Spec lookup error: {e}")