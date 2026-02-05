import anyio
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.session import ClientSession

env = {
    "PLANE_API_KEY": "plane_api_292d5a7b1b214f57b94e6e1835ae45eb",
    "PLANE_WORKSPACE_SLUG": "slurpnet",
    "PLANE_BASE_URL": "http://192.168.225.149:7210",
    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
}

async def main():
    params = StdioServerParameters(
        command="/opt/homebrew/bin/uvx",
        args=["plane-mcp-server", "stdio"],
        env=env,
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            print(f"Total Tools: {len(tools)}")
            
            resp = await session.call_tool("list_projects", {
                "workspace_slug": "slurpnet"
            })
            print("Projects:", resp)
            
            work_items = await session.call_tool("list_work_items", {
                "workspace_slug": "slurpnet",
                "project_slug": "slurpnet",
                "state": "in_progress"
            })
            print("In-Progress Work Items:", work_items)

anyio.run(main)