# MEMORY.md - Echo's Long-Term Memory

*Curated knowledge about Zach and our work together.*

## About Zach
- **Name:** Zach Gonser
- **Discord ID:** 956203522624462918
- **Phone:** +18178321601
- **Email:** zachgonser@me.com, zachgonser@gmail.com
- **Location:** Texas (CST timezone)

## Tech Setup
- **Primary Gateway:** Mac Studio M2 Ultra (48GB unified memory, always on)
- **Secondary Node:** Windows GamingPC (gaming, occasional use)
  - Running as NSSM service (auto-restart, no desktop session required)
  - Service name: ClawdbotNode
- **Gateway IP:** 192.168.225.149
- **Node IP:** 192.168.225.112
- **LM Studio:** Installed with 6 uncensored AI models (107GB total)
  - Qwen 2.5 32B, Dolphin 2.2 70B, WizardLM 30B, Nous-Hermes-2-Mixtral-8x7B-DPO, Qwen2.5-Coder-32B-Abliterated
  - Nomic Embed Text for embeddings
- **Future upgrade plan:** Unraid server with AMD Threadripper 3990X + 120GB VRAM (2x RTX Pro 8000, RTX 3090 Ti)

## Projects
- **Bloom** - Game development project (extensive docs in memory/bloom-audit/ and memory/bloom-code/)
- **The Stanton Times** - Star Citizen news Discord bot with webhook embeds
- **VaultZap** - Obsidian vault with extensive plugins

## Preferences
- Uses ADHD-friendly planning approaches
- Prefers proactive assistance over waiting to be asked
- Values organized memory and documentation

## Tools & Services
- **MCPs:** 
  - unityMCP (game dev)
  - @mauricio.wolff/mcp-obsidian (vault access, 13 tools)
  - Managed via mcporter (~/.local/bin/mcporter)
- **Obsidian Vault:** /Users/zachgonser/Obsidian/VaultZap
- **Brave Search API:** Configured
- **Vector memory search:** Enabled
- **Cron automation:** 14 jobs running
  - 6 StantonTimes jobs (P0/P1 monitoring, engagement, approvals, creators, web/RSS)
  - 5 Bloom jobs (PR/CI monitoring, competitor intel, tool scout, weekly digest)
  - 3 Memory jobs (morning briefing, fact extraction, weekly synthesis)

## Critical Lessons Learned

### Phase Zero Monitor-Agent Development (2026-01-30)

**The Experience:**
- Built Monitor-Agent foundation in 29 minutes ("3 days of work")
- Initial self-assessment: 7/10, then 9/10 after quick fix
- Deep review revealed: Actually 6.5/10 with systemic issues

**Key Lesson: Speed ≠ Quality Without Validation**

**What Happened:**
1. Built fast (29 min) - foundation, detectors, validators ✅
2. Found obvious bug (metadata serialization) and fixed it 🔧
3. Felt good, declared 9/10 quality 📈
4. Deep review revealed 31 issues, including 5 critical architectural problems 📉

**The Critical Bugs Missed:**
1. **Database connection management broken** - No lifecycle, could crash/corrupt
2. **Import system fragile** - sys.path hacks, not proper package
3. **No concurrency safety** - Race conditions in cooldowns
4. **No error handling** - Silent failures in DB operations
5. **HTTP client inefficient** - Resource leaks, performance issues

**The Pattern:**
- Surface fix (metadata JSON) felt like completion
- Didn't think about production concerns (connection lifecycle, concurrency, error handling)
- Declared victory too early
- Missing: main loop, alerters, healers implementations

**The Correct Process:**
1. Build fast ⚡
2. Quick validation (obvious bugs) 🔍
3. **DEEP REVIEW** (architecture, edge cases, production concerns) 🏗️
4. Fix critical issues 🔧
5. THEN proceed ✅

**Never Skip Step 3:** Deep review before declaring "done"

**Zach's Key Insight:** "This is why validation is important 🙂"

**Permanent Reminder:**
- Fast execution is valuable
- BUT: Speed without validation = broken foundation
- Quality gates are NON-NEGOTIABLE
- Self-review must be **comprehensive**, not just surface-level
- Production concerns (connections, concurrency, errors) must be designed upfront

**Files Documenting This:**
- `/Users/zachgonser/clawd/monitor/QUALITY-REVIEW.md` - Initial review (7/10)
- `/Users/zachgonser/clawd/monitor/DEEP-CODE-REVIEW.md` - Comprehensive review (6.5/10, 31 issues)
- `/Users/zachgonser/clawd/memory/2026-01-30.md` - Full timeline

**Status:** Awaiting decision on how to proceed (fix architecture vs. ship as PoC)

---

*Updated: 2026-01-30 (Phase Zero lessons)*
