#!/bin/bash

# Create a new project from the template
create_project() {
    local project_name=$1
    local project_path="/Users/zachgonser/clawd/projects/$project_name"
    
    # Check if project already exists
    if [ -d "$project_path" ]; then
        echo "Error: Project $project_name already exists"
        return 1
    fi
    
    # Copy project template
    cp -R /Users/zachgonser/clawd/project-template "$project_path"
    
    # Rename and update project.json
    sed -i '' "s/\"name\": \"\"/\"name\": \"$project_name\"/" "$project_path/project.json"
    
    echo "Project $project_name created successfully at $project_path"
}

# Run the function with the provided project name
create_project "$1"