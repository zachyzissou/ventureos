# TOOLS.md - Local Notes

## Plane MCP Server Integration
- Configuration file: `/plane-mcp-config.json`
- Transport: Local Stdio
- Base URL: http://192.168.225.149:7210/slurpnet/api
- Workspace Slug: slurpnet
- Note: Using local MCP server with dedicated virtual environment
- Local server path: `/Users/zachgonser/clawd/plane-mcp-server`
- Requires Python 3.10+ 
- Virtual Environment: `/Users/zachgonser/clawd/.venv/mcp-server`
- Setup Script: `/Users/zachgonser/clawd/mcp-setup.sh`
- API key: zach-personal-api-key
- Server command: `.venv/mcp-server/bin/plane-mcp-server stdio`

### Dependency Management
- Use `mcp-setup.sh` to create/reset virtual environment
- Always activate virtual environment before running MCP tools
- Isolates dependencies to prevent system-wide conflicts

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## Plane MCP Usage Guide

### Project Creation
```bash
# Activate virtual environment
source .venv/mcp-server/bin/activate

# Create Project
mcporter call 'plane.create_project({
    "name": "Project Name", 
    "identifier": "PROJ", 
    "description": "Project description"
})'
```

### Work Item Management
```bash
# Create Work Item
mcporter call 'plane.create_work_item("project_uuid", {
    "name": "Task Title",
    "description_html": "Task details",
    "priority": "high"
})'

# List Work Items
mcporter call 'plane.list_work_items("project_uuid")'
```

### Key Reminders
- Always use JSON-style parameter passing
- Use quotes carefully
- Activate MCP server virtual environment first
- Use project UUIDs from previous operations

<!-- antfarm:workflows -->
# Antfarm Workflows

Antfarm CLI (always use full path to avoid PATH issues):
`node ~/.openclaw/workspace/antfarm/dist/cli/cli.js`

Commands:
- Install: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow install <name>`
- Run: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run <workflow-id> "<task>"`
- Status: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status "<task title>"`
- Logs: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js logs`

Workflows are self-advancing via per-agent cron jobs. No manual orchestration needed.
<!-- /antfarm:workflows -->

