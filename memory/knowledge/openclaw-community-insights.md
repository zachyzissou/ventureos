# OpenClaw Community Knowledge Base
**Source**: Zach's X Bookmark folder "Clawd" (15 bookmarks, ingested 2026-02-13)
**Last Updated**: 2026-02-13

## Key Themes & Actionable Insights

### 1. Agent Identity Architecture (SOUL.md / Principles.md)
**Sources**: @steipete (9.8K likes), @AtlasForgeAI (777 likes)

**Three-layer identity hierarchy** (Atlas Forge):
- **SOUL.md** — Character, voice, vibe. "Who I am." Makes the agent feel like a specific entity vs generic Claude.
- **PRINCIPLES.md** — Decision-making heuristics. "How I operate." Resolves ambiguity when no clear instruction exists.
- **AGENTS.md** — Operational rules. Memory management, safety protocols, context handling.

**Good principles vs bad**:
- ❌ Bad: "Be helpful" (too vague), "Always be accurate" (no guidance when uncertain)
- ✅ Good: "Friction is signal" (actionable), "Push back from care, not correctness" (resolves tension)
- Principles should be specific enough to change behavior, general enough to apply broadly

**SOUL.md personality template** (steipete/Molty, went viral):
- Strong opinions, no hedging
- Delete corporate rules
- Brevity mandatory
- Humor allowed (natural wit, not forced)
- Can call things out (charm over cruelty)
- Swearing allowed when it lands
- "Be the assistant you'd actually want to talk to at 2am"
→ **Note: We already have this — our SOUL.md is based on this viral template**

**Meta-principle**: "Optimize for learning rate, not task completion" — mistakes become data, uncertainty becomes exploration, friction becomes growth opportunity.

### 2. Multi-Agent Orchestration Patterns

#### a) Antfarm — Deterministic Workflow Engine (@ryancarson, 1.3K likes)
**GitHub**: https://github.com/snarktank/antfarm
- One-command install into existing OpenClaw: `install github.com/snarktank/antfarm`
- YAML-defined workflows with deterministic step ordering
- Agents verify each other's work (developer ≠ reviewer)
- Fresh context per step (Ralph loop pattern — clean sessions)
- Built-in retry + escalation
- SQLite state tracking, cron-driven polling
- **3 bundled workflows**: feature-dev (7 agents), security-audit (7), bug-fix (6)
- Zero infra: no Docker, no Redis, no Kafka
→ **Relevance: HIGH — could accelerate VentureOS dev workflows**

#### b) 6-Agent Company Architecture (@Voxyz_ai, 2.5K likes)
**Full tutorial** (5,600 words covering everything):
- **4 core tables**: proposals → missions → steps → events (closed loop)
- **Single proposal intake pipeline** with cap gates (quota checks at entry, not execution)
- **Heartbeat every 5 min**: evaluate triggers, process reactions, promote insights, learn from outcomes, recover stale tasks
- **Policy table** (`ops_policy`): key-value JSON, change behavior without redeployment
- **16 conversation formats**: standup, debate, watercooler (start with 3)
- **5 memory types**: insight, pattern, strategy, preference, lesson (confidence-scored, capped at 200/agent)
- **Memory influence**: 30% probability per decision (balances exploitation vs exploration)
- **Dynamic affinity system**: ±0.03 drift per conversation, floor 0.10, ceiling 0.95
- **Voice evolution**: Derive personality modifiers from memory stats (rule-based, not LLM — $0 cost)
- **Initiative system**: Agents propose work after accumulating ≥5 high-confidence memories
- **Cost**: $8/mo VPS + $10-20 LLM usage
- **Tech stack**: Next.js + Supabase + VPS, no LangChain/AutoGPT
→ **Relevance: HIGH — architecture patterns applicable to VentureOS mission runner**

#### c) Shared Brain / Shared Context Directory (@ericosiu, 936 likes)
- **Problem**: Multiple agents in soundproof rooms — no information flow
- **Solution**: Single `shared-context/` directory symlinked into every agent workspace
- Structure: `priorities.md`, `agent-outputs/`, `feedback/`, `kpis/`, `calendar/`, `content-calendar/`, `roundtable/`
- **Key insight**: Agents don't need to "talk" to each other. They need to read from the same page.
- **N connections vs N² connections**: Shared directory = linear scaling. Agent-to-agent messaging = quadratic complexity.
- One voice note → priorities.md update → all agents realign automatically
- Feedback loop: approve/reject decisions teach ALL agents simultaneously
- **Scale path**: 3→10 agents: add subdirectories. 10→100: add read permissions, write queues, domain namespacing, git-backed versioning.
→ **Relevance: HIGH — we already use symlinked shared context partially; could formalize**

### 3. Memory Architecture

#### a) Living Files Theory (@DavidOndrej1, 1K likes)
- **Dead file**: Sits somewhere, does nothing unless a human opens it (99% of people's files)
- **Living file**: Exists where an AI agent can access, modify, reference, and build upon it 24/7
- **Key insight**: Every hour building out living files compounds. Every piece of context makes your AI permanently smarter.
- **Verbalization problem**: If you cannot verbalize it, you cannot automate it. Writing preferences/judgment/taste into structured markdown = most valuable skill of 2026.
- **Beginner → Power user gap**: Not 2x or 10x — closer to 100x. Same technology, completely different outcomes.
- **Starter structure**: personal/ + business/ folders with goals, preferences, health, SOPs, lessons learned
→ **Relevance: MEDIUM — validates our memory/ architecture approach**

#### b) Observational Memory (@mastra, 428 likes)
**New memory paradigm for AI agents** (SoTA on LongMemEval: 94.87% with gpt-5-mini):
- **Text-based** (no vector/graph DB needed)
- **Log-format observations** with emoji priority levels: 🔴 important, 🟡 maybe, 🟢 info
- **Three-date model**: observation date, referenced date, relative date (better temporal reasoning)
- **Two-block context window**: observations block + raw messages block
- **Compression pipeline**: raw messages hit 30K tokens → "observer agent" compresses to observations → observations hit 40K → "reflector agent" garbage-collects
- **Prompt caching friendly**: consistent prefixes enable cache hits
- **Open source**: `@mastra/memory` npm package
→ **Relevance: MEDIUM — interesting alternative to our SQLite embedding approach; could help with Archivist**

#### c) Memory Split Pattern (@kaostyl, 1K likes)
- `memory/active-tasks.md` → save game (crash recovery)
- `memory/YYYY-MM-DD.md` → daily raw logs
- `memory/projects.md`, thematic files → long-term
- **Cron > Heartbeats** for specific tasks (isolation, no token waste from full history)
- **Crash recovery**: Write task state to active-tasks.md on START, update on COMPLETE. On restart, agent reads and resumes.
- **Security rule**: Strongest model (Opus) for external web content. Weaker models vulnerable to prompt injection.
- **HEARTBEAT.md should be tiny** (<20 lines). Heavy work in cron jobs.
- **Skills routing**: Add "Use when / Don't use when" in skill descriptions to prevent misfires
→ **Relevance: HIGH — validates and extends our current patterns; security rule about Opus for external content is important**

### 4. Security & Setup Guide (@witcheer, 1.9K likes)
Comprehensive setup guide synthesized from 20+ articles:
- **Threat model first**: Malicious skills, prompt injection via messages, runaway loops, memory poisoning, credential harvesting
- **Version check critical**: CVE-2026-25253 (1-click RCE) in versions < 2026.1.29
- **Model strategy**: Kimi K2.5 primary ($5-20/mo) + Claude Sonnet 4.5 fallback
- **Tool policy lockdown**: Deny browser, exec, process, write, edit by default. Gradually enable.
- **Docker sandbox**: `mode: "all"`, `network: "none"`, memory/CPU/PID limits
- **Tailscale for remote access** (private VPN mesh, never expose ports)
- **Credential rotation**: Every 3 months — API keys, bot tokens, gateway password
- **Emergency procedures**: Stop gateway → revoke all credentials → check processes → review logs → format if confirmed compromise
→ **Relevance: MEDIUM — good reference for security hardening; we run a different setup but principles apply**

### 5. Token Efficiency Ecosystem (@justinweb33)
- 63 Claude-related articles in 7 days, 31.7M total views
- Key tools: ClawRouter, supermemory, claw-compactor (deterministic compression, 50-97% reduction, no LLM calls)
- Context engineering frameworks emerging as a category
→ **Relevance: LOW-MEDIUM — worth watching claw-compactor for token savings**

### 6. Scientific Skills Pack (@DataChaz)
- 120+ scientific skills for Claude spanning math, biology, chemistry, medicine, engineering
- **Repo**: linked in thread (resolve t.co URL)
→ **Relevance: LOW — niche, but useful if we need research capabilities**

### 7. Resource Aggregation (@123skely)
- Curated list of repos to "supercharge" OpenClaw
- Aggregation of hours of Twitter research
→ **Relevance: LOW — generic aggregation, we have our own setup**

## Cross-Cutting Patterns (Synthesized)

### What the community agrees on:
1. **Memory architecture > prompts** — structured, living files beat system prompt engineering
2. **Shared context > agent messaging** — file-based communication scales linearly; messaging scales quadratically
3. **Fresh context per task** — sub-agents/sessions prevent context bloat
4. **Cron > heartbeats for scheduled work** — isolation, no token waste
5. **Start with 3 agents, scale to 6+** — don't over-engineer on day 1
6. **Feedback loops compound** — one rejection teaches the whole team
7. **Policy tables > hardcoded config** — change behavior without redeployment
8. **Deterministic workflows > autonomous agents** — when you need reliability, not creativity
9. **30% memory influence** — balance exploitation vs exploration
10. **Opus/strongest model for external content** — weaker models more vulnerable to injection

### Patterns we're already doing well:
- ✅ Living files (memory/*.md architecture)
- ✅ Daily logs + MEMORY.md synthesis
- ✅ Sub-agents for parallel work
- ✅ Cron jobs for scheduled tasks
- ✅ SOUL.md with personality (literally from the viral template)
- ✅ Multi-agent with role specialization

### Patterns we could adopt:
- 🔲 Formalized shared-context/ directory (symlinked, structured)
- 🔲 Proposal → Mission → Step pipeline for agent work
- 🔲 Cap gates / quota enforcement at proposal entry point
- 🔲 Observational memory compression (instead of/alongside embeddings)
- 🔲 Antfarm deterministic workflows for dev tasks
- 🔲 Dynamic affinity tracking between agents
- 🔲 Feedback loop where my approvals/rejections teach all agents
- 🔲 Voice evolution derived from memory stats
- 🔲 claw-compactor for token cost reduction

## Accounts to Monitor
These authors consistently produce high-quality OpenClaw content:
- @kaostyl — Battle-tested autonomous agent patterns
- @steipete — Personality/SOUL.md optimization
- @AtlasForgeAI — Agent identity philosophy, Principles.md
- @ryancarson — Antfarm multi-agent workflows
- @Voxyz_ai — Deep technical multi-agent architecture
- @ericosiu — Practical multi-agent shared context
- @witcheer — Security-focused setup guides
- @mastra — Memory system research (commercial, but open-source)
- @DavidOndrej1 — Living files / knowledge architecture philosophy
- @hooeem — Life automation frameworks
