# Plane MCP Integration: Troubleshooting & Best Practices

## 🚨 Common Configuration Failures

### 1. Incorrect Base URL
**Problem:** Using `PLANE_BASE_URL=http://<host>:<port>/api`
**Why It Fails:** 
- Plane SDK internally appends `/api/v1`
- `/api` becomes `/api/api/v1` → 404 Not Found

**✅ Correct Configuration:**
```bash
PLANE_BASE_URL=http://192.168.225.149:7210
```

### 2. Incorrect MCP Transport Handling
**Problem:** Attempting to use HTTP requests with Content-Length headers
**Why It Fails:** 
- MCP stdio uses newline-delimited JSON-RPC
- Raw HTTP requests will hang or timeout

**✅ Correct Approach:**
- Use official MCP client (Python SDK)
- Implement MCP stdio protocol correctly

### 3. Missing Environment Variables
**Required Env Vars for Stdio:**
- `PLANE_API_KEY` (mandatory)
- `PLANE_WORKSPACE_SLUG` (mandatory)
- `PLANE_BASE_URL` (root host only)

### 4. Incorrect Docker Compose File
**Problem:** Using `docker-compose.yml` instead of `docker-compose.yaml`
**Why It Fails:**
- Legacy example file ignores `plane-app/plane.env`
- Different port/routing configuration

**✅ Correct Deployment:**
```bash
docker compose -f docker-compose.yaml --env-file plane.env up -d
```

## 🌐 Global MCP Configuration

**Location:** `/Users/zachgonser/.config/mcp.json`
```json
{
  "mcpServers": {
    "plane": {
      "command": "uvx",
      "args": ["plane-mcp-server", "stdio"],
      "env": {
        "PLANE_API_KEY": "<YOUR_API_KEY>",
        "PLANE_WORKSPACE_SLUG": "slurpnet", 
        "PLANE_BASE_URL": "http://192.168.225.149:7210"
      }
    }
  }
}
```

## 🤖 OpenClaw MCP Integration Startup Flow

1. Read global MCP config
2. Spawn process: `uvx plane-mcp-server stdio`
3. Pass environment variables explicitly:
   - `PLANE_API_KEY`
   - `PLANE_WORKSPACE_SLUG`
   - `PLANE_BASE_URL`
4. Initialize MCP session
5. Call tools/list

### MCP Capabilities
- **Total Tools:** 96
- **Sample Tools:** 
  * `list_projects`
  * `create_project`
  * `list_work_items`

## 🚦 Failure Checklist

**Quick Validation Flags:**
- ❌ `PLANE_BASE_URL` ends with `/api`
- ❌ Attempting HTTP framing over stdio
- ❌ No env vars passed to server process
- ❌ Using `docker-compose.yml` instead of `docker-compose.yaml`

## 🧪 Recommended Self-Test Script

```python
def mcp_plane_self_test():
    # Validate MCP server connectivity
    try:
        # Initialize MCP client
        tools = list_mcp_tools()
        assert len(tools) > 90, "Insufficient tools discovered"
        
        # Perform a safe, read-only operation
        projects = list_projects()
        assert len(projects) >= 0, "Unable to list projects"
        
        return True
    except Exception as e:
        log_mcp_error(e)
        return False
```

## 🔍 Debugging Tips
- Always use the MCP SDK
- Explicitly pass environment variables
- Verify base URL configuration
- Use stdio-specific MCP clients