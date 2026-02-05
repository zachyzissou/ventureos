# Plane MCP CLI

## Setup

1. Install dependencies:
```bash
/opt/homebrew/bin/uvx pip install plane-mcp-server mcp anyio
```

2. Set environment variables:
```bash
export PLANE_API_KEY=your_api_key
export PLANE_WORKSPACE_SLUG=your_workspace_slug
```

## Usage Examples

### List Projects
```bash
plane-mcp list_projects
```

### List Work Items
```bash
plane-mcp list_work_items project_id="project_uuid" state="in_progress"
```

### Create Work Item
```bash
plane-mcp create_work_item project_id="project_uuid" name="New Task" description="Task details"
```

## Available Tools
- `list_projects`
- `list_work_items`
- `create_work_item`
- `update_work_item`
- `retrieve_project`
- And 50+ more tools

## Troubleshooting
- Ensure API key and workspace slug are set
- Check Plane MCP server is installed
- Verify network connectivity