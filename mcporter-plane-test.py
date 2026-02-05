#!/usr/bin/env python3
import subprocess
import json
import sys

def test_plane_connection():
    try:
        # Use mcporter CLI to list projects
        result = subprocess.run(['mcporter', 'call', 'plane.list_projects'], 
                                capture_output=True, 
                                text=True, 
                                check=True)
        
        # Parse the output
        projects = json.loads(result.stdout)
        
        print("Connected successfully. Projects found:")
        for project in projects:
            print(f"- {project['name']} (ID: {project['id']})")
        
        return True
    except subprocess.CalledProcessError as e:
        print(f"Connection test failed. Error output:\n{e.stderr}")
        return False
    except json.JSONDecodeError:
        print("Failed to parse JSON response")
        return False
    except Exception as e:
        print(f"Unexpected error: {e}")
        return False

def main():
    if test_plane_connection():
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()