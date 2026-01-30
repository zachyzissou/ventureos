# Coding Agent Prompt Library
*Specialized prompts for Monitor-Agent development with Codex/Cursor*

## Overview

Generic prompts don't work well with our nested architecture. These specialized prompts include:
- Exact file paths
- Existing code examples
- Architecture constraints
- Expected patterns

## Prompt Templates

### 1. Generate New Detector

**Use when:** Adding a new infrastructure/security/performance detector

**Working directory:** `/Users/zachgonser/clawd/monitor/detectors/`

**Prompt:**
```
Create a new detector at detectors/[NAME]_detector.py following this exact pattern:

REFERENCE FILE: detectors/gateway_detector.py
FOLLOW THIS STRUCTURE:

1. Import from base classes (NOT from monitor.detector):
   from detector import InfrastructureDetector

2. Class structure:
   - Inherit from correct base (InfrastructureDetector/SecurityDetector/etc.)
   - __init__(self, config: dict)
   - async def detect(self) -> List[Issue]

3. Use existing models:
   from models import Issue, Severity, Category

4. Error handling pattern:
   try/except with logger.error() and metadata capture

5. Async subprocess pattern:
   subprocess.create_subprocess_exec() with timeout

SPECIFIC REQUIREMENTS:
- Detector name: [NAME]Detector
- What it monitors: [DESCRIPTION]
- Detection logic: [SPECIFIC CHECK]
- Issue severity: [P0/P1/P2/P3]
- Auto-fixable: [true/false]

COPY the exact import structure from gateway_detector.py.
COPY the exact async/await patterns.
COPY the exact error handling approach.

Output ONLY the Python code, no explanations.
```

**Example:**
```bash
cd /Users/zachgonser/clawd/monitor/detectors
npx codex exec --sandbox workspace-write "Create a new detector at detectors/memory_detector.py following gateway_detector.py pattern. Monitor system memory usage, alert at 90% (P1). Use 'free -m' command. Auto-fixable: false."
```

---

### 2. Generate New Healer

**Use when:** Adding auto-fix capability for a new issue type

**Working directory:** `/Users/zachgonser/clawd/monitor/monitor/healers/`

**Prompt:**
```
Create a new healer at monitor/healers/[NAME]_healer.py

REFERENCE: monitor/healers/gateway_healer.py

EXACT STRUCTURE TO FOLLOW:

1. Imports (copy exactly):
   from monitor.models import Issue, HealResult
   from monitor.healer import BaseHealer
   import logging

2. Class pattern:
   class [NAME]Healer(BaseHealer):
       def __init__(self, config: dict = None):
           if config is None:
               config = {"healing": {"enabled": True, "max_attempts": 3, "cooldown_seconds": [TIME]}}
           super().__init__(config)
       
       async def can_heal_issue(self, issue: Issue) -> bool:
           from monitor.models import Category
           return (
               issue.category == Category.[CATEGORY] and
               issue.system == "[SYSTEM]" and
               issue.can_auto_fix
           )
       
       async def heal(self, issue: Issue) -> HealResult:
           # Implementation here

3. Heal implementation must include:
   - logger.info() at start with issue_id
   - try/except block
   - asyncio subprocess with timeout
   - Return HealResult with success/message/metadata
   - logger.error() on failures

SPECIFIC REQUIREMENTS:
- Healer name: [NAME]Healer
- What it fixes: [DESCRIPTION]
- Heal action: [SPECIFIC COMMAND]
- Cooldown: [SECONDS] seconds
- Category: [INFRASTRUCTURE/DATA_INTEGRITY/etc.]
- System: [system name]

DO NOT invent new patterns. COPY gateway_healer.py structure exactly.
```

**Example:**
```bash
cd /Users/zachgonser/clawd/monitor
npx codex exec --sandbox workspace-write -C monitor/healers "Create NetworkHealer at monitor/healers/network_healer.py. Fixes network connectivity issues by restarting NetworkManager. Category: INFRASTRUCTURE, System: network, Cooldown: 600s. Follow gateway_healer.py exactly."
```

---

### 3. Generate Test Suite

**Use when:** Need comprehensive tests for a new module

**Working directory:** `/Users/zachgonser/clawd/monitor/`

**Prompt:**
```
Create test suite at test_[MODULE].py

REFERENCE: test_healers.py

EXACT PATTERN TO FOLLOW:

1. Imports:
   import asyncio
   from monitor.models import Issue, Severity, Category
   from monitor.[module] import [Classes]

2. Test structure (copy from test_healers.py):
   - async def test_[feature](): with print() statements
   - assert statements with clear messages
   - async def main(): wrapper
   - if __name__ == "__main__": asyncio.run(main())

3. Required tests:
   - Initialization (config handling)
   - Core functionality (main method works)
   - Edge cases (error handling)
   - Integration (works with models)

4. Output format (copy exactly):
   print("=" * 60)
   print("[TEST NAME]")
   print("=" * 60)
   print(f"Result: {value} ✅")

SPECIFIC REQUIREMENTS:
- Module to test: [MODULE]
- Classes: [LIST]
- Key behaviors: [LIST]

Generate ALL tests needed for 100% coverage.
Output ONLY Python code.
```

---

### 4. Generate Alerter

**Use when:** Adding new alert destination (SMS, Slack, etc.)

**Working directory:** `/Users/zachgonser/clawd/monitor/monitor/alerters/`

**Prompt:**
```
Create alerter at monitor/alerters/[NAME]_alerter.py

REFERENCE: monitor/alerters/discord_alerter.py (READ THIS FIRST)

EXACT STRUCTURE:

1. Inherit from BaseAlerter (in monitor/alerter.py)
2. Implement required methods:
   - async def send_alert(self, issue: Issue, escalation: bool) -> bool
   - async def send_heal_result(self, issue: Issue, result: HealResult) -> bool

3. Alert routing logic (COPY from DiscordAlerter):
   - Check should_alert() for deduplication
   - Route P2/P3 to batching
   - Send P0/P1 immediately
   - Record alert after sending

4. Use HTTPClientManager for HTTP calls:
   async with HTTPClientManager() as client:
       response = await client.post(url, json=payload)

SPECIFIC REQUIREMENTS:
- Alerter name: [NAME]Alerter
- Destination: [SERVICE]
- API endpoint: [URL]
- Authentication: [METHOD]
- Payload format: [STRUCTURE]

COPY DiscordAlerter's error handling, logging, and deduplication logic exactly.
```

---

## When to Use Which Tool

### Use Codex (`npx codex exec`) for:
✅ Generating new modules following existing patterns  
✅ Creating test suites  
✅ Refactoring code with specific constraints  
✅ Quick boilerplate generation  

**NOT for:**
❌ Complex multi-file changes  
❌ Architecture decisions  
❌ Debugging existing code  

### Use Cursor Agent (`cursor-agent`) for:
✅ Architecture planning (`--mode plan`)  
✅ Code explanations (`--mode ask`)  
✅ Multi-file refactoring  
✅ Complex integrations  

**NOT for:**
❌ Simple one-file generation (Codex is faster)  
❌ Following exact patterns (too creative)  

### Use Manual Coding for:
✅ When you already know the exact pattern  
✅ Simple modifications to existing code  
✅ Quick 5-10 min implementations  
✅ Nested directory structures (until we optimize prompts)  

---

## Working Directory Setup

**CRITICAL:** Always set working directory to the right level

```bash
# For detectors (flat structure)
cd /Users/zachgonser/clawd/monitor/detectors
npx codex exec -C . "prompt"

# For healers/alerters (nested in monitor/)
cd /Users/zachgonser/clawd/monitor
npx codex exec -C monitor/healers "prompt"

# For tests (top level)
cd /Users/zachgonser/clawd/monitor
npx codex exec -C . "prompt"
```

---

## Success Metrics

**Good prompt:**
- Codex generates working code in <30 seconds
- Minimal edits needed (imports, small fixes)
- Follows existing patterns exactly
- Tests pass on first try

**Bad prompt:**
- Codex explores directories >30s
- Invents new patterns
- Requires major rewrites
- Wrong import paths

---

## Next Steps to Improve

1. **Test each prompt template** with real examples
2. **Measure time saved** vs manual coding
3. **Refine prompts** based on what works
4. **Build wrapper scripts** that auto-populate prompts
5. **Create examples library** of successful generations

---

*Created: 2026-01-30*  
*Status: Needs validation with real usage*
