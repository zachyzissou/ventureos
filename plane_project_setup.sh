#!/bin/bash
set -e

# Plane Project Setup Script
PROJECT_ID="b7824695-65e5-4da6-ba57-3f7ac172266d"

# Work Item Types
WORK_ITEM_TYPES=(
    "Feature:New functionality or enhancement to existing systems:false"
    "Bug:Defect or unexpected behavior that needs fixing:false"
    "Epic:Large, complex work item that spans multiple sprints:true"
    "Research:Investigative work to explore new technologies or approaches:false"
    "Chore:Maintenance tasks, refactoring, or infrastructure work:false"
)

# Features to Enable
FEATURES=(
    "time_tracking"
    "issue_types"
    "modules"
    "intake"
)

# Project Views
VIEWS=(
    "This Sprint:Work items scheduled for the current sprint"
    "Blocked:Work items currently blocked or waiting on dependencies"
    "Overdue:Work items past their target completion date"
    "High Priority:Critical work items requiring immediate attention"
)

# Function to create work item types
create_work_item_types() {
    for type in "${WORK_ITEM_TYPES[@]}"; do
        IFS=':' read -r name description is_epic <<< "$type"
        
        # Attempt to delete existing type (ignore errors)
        mcporter call plane.delete_work_item_type project_id:"$PROJECT_ID" work_item_type_id:"$name" 2>/dev/null || true
        
        # Create work item type
        mcporter call plane.create_work_item_type \
            project_id:"$PROJECT_ID" \
            name:"$name" \
            description:"$description" \
            is_epic:"$is_epic"
    done
}

# Function to enable project features
enable_project_features() {
    for feature in "${FEATURES[@]}"; do
        mcporter call plane.update_project_features \
            project_id:"$PROJECT_ID" \
            "$feature":true
    done
}

# Function to create project views
create_project_views() {
    for view in "${VIEWS[@]}"; do
        IFS=':' read -r name description <<< "$view"
        
        # Attempt to delete existing view (ignore errors)
        mcporter call plane.delete_project_page project_id:"$PROJECT_ID" page_id:"$name" 2>/dev/null || true
        
        # Create project page/view
        mcporter call plane.create_project_page \
            project_id:"$PROJECT_ID" \
            name:"$name" \
            description_html:"$description"
    done
}

# Main execution
main() {
    echo "Starting Plane Project Configuration..."
    
    create_work_item_types
    enable_project_features
    create_project_views
    
    echo "Plane Project Configuration Complete!"
}

main