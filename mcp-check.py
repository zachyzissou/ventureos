import anyio
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.session import ClientSession

async def main():
    env = {
        "PLANE_API_KEY": "plane_api_292d5a7b1b214f57b94e6e1835ae45eb",
        "PLANE_WORKSPACE_SLUG": "slurpnet",
        "PLANE_BASE_URL": "http://192.168.225.149:7210",
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
    }

    params = StdioServerParameters(
        command="/opt/homebrew/bin/uvx",
        args=["plane-mcp-server", "stdio"],
        env=env,
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            tools = (await session.list_tools()).tools
            print(f"TOOLS_COUNT {len(tools)}")
            
            projects_result = await session.call_tool("list_projects", {})
            projects = projects_result.structuredContent['result']
            
            project_count = len(projects)
            print(f"PROJECT_RESULT_COUNT {project_count}")
            
            for project in projects:
                print(f"{project.get('name', 'Unknown')} {project.get('id', 'No ID')}")

anyio.run(main)