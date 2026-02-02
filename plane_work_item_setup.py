#!/usr/bin/env python3
import subprocess
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

class PlaneWorkItemConfigurator:
    def __init__(self, project_id):
        self.project_id = project_id
    
    def update_states(self):
        """Update project states with more descriptive information"""
        states = [
            {
                "name": "Backlog",
                "description": "Initial collection of work items waiting to be prioritized",
                "color": "#60646C",
                "group": "backlog",
                "default": True
            },
            {
                "name": "Prioritized",
                "description": "Work items ready for upcoming sprint planning",
                "color": "#3B82F6",
                "group": "unstarted"
            },
            {
                "name": "Todo",
                "description": "Work items selected for the current sprint",
                "color": "#10B981",
                "group": "unstarted"
            },
            {
                "name": "In Progress",
                "description": "Active work currently being developed",
                "color": "#F59E0B",
                "group": "started"
            },
            {
                "name": "Review",
                "description": "Work items awaiting peer review or QA",
                "color": "#6366F1",
                "group": "started"
            },
            {
                "name": "Done",
                "description": "Completed and verified work items",
                "color": "#46A758",
                "group": "completed"
            },
            {
                "name": "Blocked",
                "description": "Work items impeded by external dependencies",
                "color": "#EF4444",
                "group": "unstarted"
            },
            {
                "name": "Cancelled",
                "description": "Work items no longer relevant or needed",
                "color": "#9AA4BC",
                "group": "cancelled"
            }
        ]
        
        for state in states:
            try:
                cmd = ['mcporter', 'call', 'plane.create_state', 
                       f'project_id:{self.project_id}',
                       f'name:{state["name"]}',
                       f'color:{state["color"]}',
                       f'description:{state["description"]}',
                       f'group:{state["group"]}']
                
                if state.get('default', False):
                    cmd.append('default:true')
                
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                logging.info(f"Created/Updated state: {state['name']}")
            except subprocess.CalledProcessError as e:
                logging.error(f"Failed to create state {state['name']}: {e.stderr}")
    
    def create_work_item_types(self):
        """Create standardized work item types"""
        work_item_types = [
            {
                "name": "Feature",
                "description": "New functionality or enhancement to existing systems",
                "is_epic": False
            },
            {
                "name": "Bug",
                "description": "Defect or unexpected behavior that needs fixing",
                "is_epic": False
            },
            {
                "name": "Epic",
                "description": "Large, complex work item that spans multiple sprints",
                "is_epic": True
            },
            {
                "name": "Research",
                "description": "Investigative work to explore new technologies or approaches",
                "is_epic": False
            },
            {
                "name": "Chore",
                "description": "Maintenance tasks, refactoring, or infrastructure work",
                "is_epic": False
            }
        ]
        
        for item_type in work_item_types:
            try:
                cmd = ['mcporter', 'call', 'plane.create_work_item_type', 
                       f'project_id:{self.project_id}',
                       f'name:{item_type["name"]}',
                       f'description:{item_type["description"]}',
                       f'is_epic:{"true" if item_type["is_epic"] else "false"}']
                
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                logging.info(f"Created work item type: {item_type['name']}")
            except subprocess.CalledProcessError as e:
                logging.error(f"Failed to create work item type {item_type['name']}: {e.stderr}")

def main():
    # Plane Platform Improvements project ID
    project_id = 'b7824695-65e5-4da6-ba57-3f7ac172266d'
    
    configurator = PlaneWorkItemConfigurator(project_id)
    
    # Update states first
    configurator.update_states()
    
    # Create work item types
    configurator.create_work_item_types()

if __name__ == "__main__":
    main()