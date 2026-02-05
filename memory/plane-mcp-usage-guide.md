# Plane MCP (Mission Control Platform) Usage Guide

## Core Interaction Method
- Always use `mcporter call` prefix
- Syntax: `mcporter call 'plane.FUNCTION_NAME({parameters})'`

## Project Creation
```bash
mcporter call 'plane.create_project({
    "name": "Project Name",
    "identifier": "PROJ",
    "description": "Project description"
})'
```

## Key Project Management Functions

### List Projects
```bash
mcporter call 'plane.list_projects()'
```

### Retrieve Specific Project
```bash
mcporter call 'plane.retrieve_project("project_uuid")'
```

### Update Project
```bash
mcporter call 'plane.update_project("project_uuid", {
    "name": "Updated Project Name",
    "description": "New description"
})'
```

## Work Item Management

### Create Work Item
```bash
mcporter call 'plane.create_work_item("project_uuid", {
    "name": "Task Title",
    "description_html": "Task details",
    "priority": "high"
})'
```

### List Work Items
```bash
mcporter call 'plane.list_work_items("project_uuid")'
```

## Workspace Operations

### Get Workspace Members
```bash
mcporter call 'plane.get_workspace_members()'
```

## Critical Reminders
- Always use JSON-style parameter passing
- Quotes are crucial
- Use project UUID from previous create/list operations
- Activate MCP server virtual environment first

## Troubleshooting
- If command fails, check:
  1. Virtual environment activation
  2. Syntax exactness
  3. Parameter validity
  4. Network connectivity

## Environments
- Local MCP Server: `http://192.168.225.149:7210`
- Workspace Slug: `slurpnet`

## Authentication
- Uses API key from `/Users/zachgonser/clawd/plane-mcp-config.json`
- Token stored in environment variable

---

*Last Updated: 2026-02-02*
*Maintainer: Claude Code*