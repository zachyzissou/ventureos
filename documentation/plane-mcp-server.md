# Plane MCP Server Documentation

## Overview
The Model Context Protocol (MCP) is a standardized interface enabling AI models to communicate with external tools and services. The Plane MCP Server allows AI agents to interact with Plane's project management capabilities through multiple transport methods.

## Transport Methods

| Transport | Best For | Authentication |
|-----------|----------|----------------|
| HTTP with OAuth | Cloud users, simplest setup | Browser-based OAuth |
| HTTP with PAT Token | Automated workflows, CI/CD | API key in headers |
| Local Stdio | Self-hosted Plane instances | Environment variables |
| SSE (Legacy) | Existing integrations | Browser-based OAuth |

## Key Setup Options

### Remote HTTP with OAuth
- Requires Node.js 22+
- Configuration example for various IDEs:
```json
{
 "mcpServers": {
   "plane": {
     "command": "npx",
     "args": ["mcp-remote@latest", "https://mcp.plane.so/http/mcp"]
   }
 }
}
```

### Remote HTTP with PAT Token
- Requires Node.js 22+
- Needs Plane API Key
```json
{
 "mcpServers": {
   "plane": {
     "command": "npx",
     "args": ["mcp-remote@latest", "https://mcp.plane.so/http/api-key/mcp"],
     "headers": {
       "Authorization": "Bearer <YOUR_API_KEY>",
       "X-Workspace-slug": "<YOUR_WORKSPACE_SLUG>"
     }
   }
 }
}
```

### Local Stdio Transport
- Requires Python 3.10+
- Uses environment variables
```json
{
 "mcpServers": {
   "plane": {
     "command": "uvx",
     "args": ["plane-mcp-server", "stdio"],
     "env": {
       "PLANE_API_KEY": "<YOUR_API_KEY>",
       "PLANE_WORKSPACE_SLUG": "<YOUR_WORKSPACE_SLUG>",
       "PLANE_BASE_URL": "https://your-plane-instance.com/api"
     }
   }
 }
}
```

## Troubleshooting
- Authentication issues: `rm -rf ~/.mcp-auth`
- Check internet connection
- Verify firewall/proxy settings
- Ensure correct Node.js/Python versions

## Support
- Support email: support@plane.so
- MCP community forums: https://modelcontextprotocol.io

## Source
- GitHub: https://github.com/makeplane/plane-mcp-server