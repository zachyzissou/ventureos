# Plane MCP Skill

## Overview
Interact with Plane project management system using Model Context Protocol (MCP) server.

## Capabilities
- List projects
- Retrieve project details
- List work items
- Create and update work items
- Manage cycles and modules

## Configuration
Requires environment variables:
- `PLANE_API_KEY`: Plane API authentication key
- `PLANE_WORKSPACE_SLUG`: Workspace identifier
- `PLANE_BASE_URL`: Optional base URL (defaults to https://api.plane.so)

## Tools
Supports 55+ MCP tools across categories:
- Projects
- Work Items
- Cycles
- Modules
- Initiatives
- Intake Work Items
- User Management

## Usage Examples
```bash
# List projects in current workspace
plane-mcp list_projects

# List in-progress work items in a specific project
plane-mcp list_work_items project_id="project_uuid" state="in_progress"

# Create a new work item
plane-mcp create_work_item project_id="project_uuid" name="New Task" description="Task details"
```

## Security
- Uses secure token-based authentication
- Supports stdio, HTTP, and SSE transports
- Credentials managed via environment variables

## Performance
- Lightweight Python implementation
- FastMCP for efficient communication
- Pydantic for type safety