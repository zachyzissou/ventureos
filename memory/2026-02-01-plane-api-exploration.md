# Plane API Exploration

## Instance Details
- **URL:** http://192.168.225.149:7210/
- **Workspace:** SlurpNet
- **Project:** OpenClaw Autonomy Infrastructure (ID: ee9b9bdb-0300-4b7e-a8f8-e7da904a62aa)

## API Access
- **Personal Access Tokens:** Available at `/slurpnet/settings/account/api-tokens/`
- Two tokens already exist: "OpenClaw" and "OpenClaw 2" (both active, never expire)
- To create new token: Settings → Account → Developer → Personal Access Tokens

## API Endpoints (to explore)
The standard `/api/v1/` didn't work. Plane likely uses:
- Backend API at port 8000 internally (check docker-compose)
- Need to check network requests in browser DevTools for actual endpoints

## Webhooks
- Available at `/slurpnet/settings/webhooks/`
- Can set up webhooks for integrating with external systems

## What's Working
- ✅ Web UI fully functional
- ✅ Project management working
- ✅ Labels can be created/managed
- ✅ Work items/issues working

## Next Steps for API Integration
1. Create a new API token and capture the value
2. Check Plane's GitHub for API documentation
3. Inspect network requests in browser to understand actual endpoints
4. Build a simple Python/Node script to test API calls

## CLI Agent Issues (RESOLVED)
- ✅ Codex works via `npx @openai/codex`
- ✅ Successfully generated plane-labels.json and plane-issue-details.json
- Claude Code needs OAuth setup (not headless-friendly)

## MCP Server Integration
**Official Plane MCP Server:** https://github.com/makeplane/plane-mcp-server

**Issue:** Self-hosted Plane API differs from cloud:
- Cloud: `/api/v1/` endpoints with API key auth
- Self-hosted: `/api/` endpoints, different auth mechanism
- Token created: `plane_api_e255c8aa75314f1da33f64cba2808e28` (MCP-Integration)

**Next steps for MCP:**
1. Check Plane self-hosted docs for API authentication
2. May need to use session cookies or different token format
3. Alternative: Use browser automation for now (works fine)

## Generated Content Ready
- `~/clawd/plane-labels.json` - Labels to create
- `~/clawd/plane-issue-details.json` - Issue descriptions with acceptance criteria
