# WebMCP Integration

Issue: #225

## Scope

This adds a structured WebMCP client path with cache + fallback:

- `lib/webmcp-client.ts`
- `dashboard/server/routes/webmcp.ts`

## Capabilities

- tool discovery from WebMCP-compatible manifests
- typed tool invocation (JSON-schema-style arg validation)
- per-site discovery cache to avoid repeated schema fetches
- fallback to browser automation when discovery/invocation fails

## Default Site Profiles

Configured discovery profiles:

- `https://webmachinelearning.github.io/webmcp/`
- `https://usechar.ai/`
- `https://docs.mcp-b.ai/`

## API

- `GET /api/webmcp/sites`
- `GET /api/webmcp/metrics`
- `POST /api/webmcp/discover`
- `POST /api/webmcp/invoke`

## Notes on Standard Maturity

The current WebMCP proposal is still evolving. This implementation keeps transport and site handling adapter-driven so additional discovery/invocation mechanisms can be added without changing caller contracts.

