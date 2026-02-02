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

### Recent Configuration Notes (2026-02-01)
- MCP Server Configuration
  * Standardized API key management
  * Stdio transport method configured
  * Base URL set to `http://192.168.225.149:7210`
  * Workspace Slug: `slurpnet`

### StantonTimes Workflow Update
- Pending Tweets Approval Mechanism
  * Manual review process in place
  * Discord integration for tweet approvals
  * Tracking system for pending tweets
  * Automated tracking of tweet statuses

### Plane Issue Creation Policy (2026-02-01)
**Discord is signal, not a task-creation trigger.** Use logic to decide when to create issues.

**Create a Plane issue when:**
- It’s a **repeatable task**, **blocker**, or **multi-step project work**
- It spans **>1 session** or needs tracking over days
- It affects **core systems** (StantonTimes, Bloom, Clawdbot infra)

**Do NOT create an issue when:**
- It’s a **one-off quick request**
- It’s just **brainstorming**, info, or a fleeting thought
- It’s sensitive (P1+) unless explicitly confirmed

**When uncertain:**
- Ask a quick “Track this?” confirmation.

**Default routing:**
- Auto-issues go to **Clawdbot Autonomy Infrastructure** unless otherwise specified.

[Rest of the previous MEMORY.md content remains unchanged]