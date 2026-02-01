# MEMORY.md - Echo's Long-Term Memory

*Curated knowledge about Zach and our work together.*

[Previous content remains the same]

## Project Management Tools

### Current Tracking Solution (2026-02-01)
**Tool:** Plane.sh
- Open-source, locally deployable project management platform
- Selected for Queue Management System implementation
- Features:
  * GitHub-like interface
  * Docker and Kubernetes support
  * Robust issue tracking
  * Developer-friendly design
- Deployment: Local Docker instance
- Selection Rationale:
  1. Comprehensive project tracking
  2. Active development community
  3. Self-hostable with complete data ownership
- Configuration Lessons:
  * Strict adherence to official documentation
  * Precise environment configuration
  * Careful port and proxy management
- Reference Documentation: `/documentation/plane-selfhost-checklist.md`

### Plane MCP Server Integration
- Discovered Model Context Protocol (MCP) server for Plane
- Supports multiple transport methods:
  * HTTP with OAuth (cloud)
  * HTTP with PAT Token (CI/CD)
  * Local Stdio (self-hosted)
- Comprehensive Troubleshooting Guide: `/documentation/plane-mcp-troubleshooting.md`
- Key Insights:
  * Precise base URL configuration
  * Stdio-specific protocol handling
  * Explicit environment variable management
- Integration enables programmatic project management across different development environments
- Total Available Tools: 96+

[Rest of the previous MEMORY.md content remains unchanged]