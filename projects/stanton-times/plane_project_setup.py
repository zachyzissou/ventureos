import sys
import json
import os

# Optional local override for environments that keep Plane tooling in a separate venv.
extra_site_packages = os.getenv("STANTON_TIMES_PLANE_SITE_PACKAGES", "").strip()
if extra_site_packages:
    sys.path.append(extra_site_packages)

# Configuration
PROJECT_ID = "de035243-4d44-44cf-ad37-0c10b4208a7d"
WORKSPACE_SLUG = "slurpnet"

def create_project_states():
    states = [
        {"name": "Backlog", "color": "#5D9CEC", "group": "backlog"},
        {"name": "In Progress", "color": "#48CFAD", "group": "started"},
        {"name": "In Review", "color": "#FFCE54", "group": "started"},
        {"name": "Done", "color": "#4A89DC", "group": "completed"},
        {"name": "Blocked", "color": "#ED5565", "group": "cancelled"}
    ]
    
    for state in states:
        mcporter.call(f'plane.create_state("{PROJECT_ID}", "{state["name"]}", "{state["color"]}")')

def create_work_item_types():
    types = [
        {"name": "Feature", "description": "New feature development"},
        {"name": "Bug", "description": "Bug fixes and improvements"},
        {"name": "Technical Debt", "description": "Refactoring and system improvements"}
    ]
    
    for type_data in types:
        mcporter.call(f'plane.create_work_item_type("{PROJECT_ID}", "{type_data["name"]}", "{type_data["description"]}")')

def create_labels():
    labels = [
        {"name": "High Priority", "color": "#FF0000"},
        {"name": "Restoration", "color": "#FFAA00"},
        {"name": "API Integration", "color": "#4A89DC"},
        {"name": "Performance", "color": "#48CFAD"}
    ]
    
    for label in labels:
        mcporter.call(f'plane.create_label("{PROJECT_ID}", "{label["name"]}", "{label["color"]}")')

def create_work_items():
    work_items = [
        {
            "name": "Restore Source Monitoring System",
            "description": "Rebuild the source monitoring component for Stanton Times\n\n## Objectives\n- Track key Star Citizen news accounts\n- Implement robust error handling\n- Ensure API compatibility",
            "priority": "high"
        },
        {
            "name": "Rebuild Discord Verification Workflow",
            "description": "Restore the reaction-based content approval system\n\n## Key Requirements\n- Implement Discord webhook integration\n- Create reaction-based approval mechanism\n- Ensure consistent content review process",
            "priority": "high"
        },
        {
            "name": "Implement ML Content Scoring",
            "description": "Develop machine learning content scoring mechanism\n\n## Components\n- Train ML model on historical content\n- Implement scoring algorithm\n- Create content filtering system",
            "priority": "medium"
        },
        {
            "name": "Update Twitter Publishing Script",
            "description": "Modify tweet publishing mechanism\n\n## Objectives\n- Adapt to current Twitter API\n- Implement content optimization\n- Ensure reliable publishing workflow",
            "priority": "high"
        }
    ]
    
    for item in work_items:
        mcporter.call(f'plane.create_work_item("{PROJECT_ID}", "{item["name"]}")')

def create_cycle():
    mcporter.call(f'plane.create_cycle("{PROJECT_ID}", "Stanton Times Restoration", "7a5b8667-2ffa-41ad-9705-12f499d97c4d", "Project restoration and system rebuild")')

def main():
    # Update project features
    mcporter.call(f'plane.update_project_features("{PROJECT_ID}", modules=True, cycles=True, issue_views_view=True, intake_view=True, is_issue_type_enabled=True)')
    
    # Create project structure
    create_project_states()
    create_work_item_types()
    create_labels()
    create_work_items()
    create_cycle()

    print("Stanton Times project setup complete!")

if __name__ == "__main__":
    main()
