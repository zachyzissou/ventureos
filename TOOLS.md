# TOOLS.md - Local Notes

## Plane MCP Server Integration
- Configuration file: `/plane-mcp-config.json`
- Transport: Local Stdio
- Base URL: http://192.168.225.149:7210/slurpnet/api
- Workspace Slug: slurpnet
- Note: Using local MCP server from GitHub repository
- Local server path: `/Users/zachgonser/clawd/plane-mcp-server`
- Requires Python 3.10+ with uv
- API key: zach-personal-api-key
- Server command: `.venv/bin/plane-mcp-server stdio`

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
