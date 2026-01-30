# Universal Validation Methodology

**Applies to:** All work — Bloom, Stanton Times, new projects, sub-agents, everything.

---

## Core Loop

```
FIND → VALIDATE → FIX → VERIFY
```

Every task, every agent, every time. No exceptions.

---

## Phase Definitions

### 1. FIND
Locate and understand the problem/task completely before acting.

| Action | Requirement |
|--------|-------------|
| Read relevant code/docs | Understand existing patterns |
| Search for related work | Check if already solved/attempted |
| Identify dependencies | What does this touch? What could break? |
| Confirm scope | Don't assume — verify what's actually needed |

**Gate:** Do not proceed until you can explain the problem and solution approach.

### 2. VALIDATE
Confirm your understanding and approach before implementing.

| Action | Requirement |
|--------|-------------|
| Check existing patterns | Follow established conventions |
| Verify assumptions | Don't guess — search, test, confirm |
| Identify edge cases | What could go wrong? |
| Confirm requirements | Re-read the ask — are you solving the right problem? |

**Gate:** Do not proceed if any assumption is unverified.

### 3. FIX
Implement the solution.

| Action | Requirement |
|--------|-------------|
| Follow patterns | Match existing code style, architecture |
| Keep changes minimal | Don't refactor unrelated code |
| Document as you go | Comments, memory notes, changelogs |
| Handle errors | Don't swallow exceptions, add proper error handling |

**Gate:** Implementation must be complete — no TODOs, no "will fix later."

### 4. VERIFY
Confirm the fix actually works before claiming done.

| Action | Requirement |
|--------|-------------|
| Compile/syntax check | Code must compile without errors |
| Test the change | Run relevant tests, manual verification |
| Check integration | Does it work with existing systems? |
| Verify edge cases | Test the failure modes you identified |
| Confirm no regressions | Didn't break anything else |

**Gate:** Do NOT claim "done" until verification passes.

---

## Real-Time Issue Resolution

When you encounter a problem during any phase:

```
DETECT → DIAGNOSE → SOLVE → CONTINUE
```

### Rules:
1. **Auto-fix if possible** — Don't report and wait; fix it.
2. **Escalate only when blocked** — Missing credentials, need human decision, destructive action.
3. **Document fixes inline** — Note what you found and fixed in your deliverable doc.
4. **Don't accumulate issues** — Fix each one before moving on.

### Escalation Criteria (ask Zach):
- Requires credentials/access you don't have
- Irreversible/destructive action
- Design decision needed (multiple valid approaches)
- Cost/time implications beyond scope

---

## Sub-Agent Task Template

All sub-agent spawns MUST include this structure:

```markdown
## [Task Name]

**Domain:** [Specialist type — Networking, Content, QA, etc.]
**Codebase:** [Full path to project root]

### Context
[Domain-specific information]
- Pattern references (existing code to follow)
- Related documentation
- Known constraints

### Task
[Specific, measurable deliverable]

### Methodology (MANDATORY)
```
FIND → VALIDATE → FIX → VERIFY
```
- Complete ALL phases before reporting done
- Auto-fix issues encountered; escalate only if blocked
- Document work in memory/[project]/[task-name].md

### Verification Criteria
- [ ] Code compiles without errors
- [ ] Follows existing patterns
- [ ] Tests pass (if applicable)
- [ ] Documentation created
- [ ] No broken references/dependencies

### Deliverable
[Clear success criteria — what does "done" look like?]
```

---

## Project-Specific Additions

### Bloom (Unity/C#)
- **Compile check:** Use `mcporter call unityMCP.validate_script` on new/modified `.cs` files
- **Trigger compilation:** Use `mcporter call unityMCP.refresh_unity compile=request wait_for_ready=true`
- **Check errors:** Use `mcporter call unityMCP.read_console types='["error","warning"]'`
- **Run tests:** Use `mcporter call unityMCP.run_tests` then `get_test_job` to poll results
- **Pattern source:** Check existing systems in same domain (e.g., networking → PlayerInventory, FactionAbilitySystem)
- **Test location:** `Assets/Tests/`
- **Doc location:** `memory/bloom-code/`

**Unity MCP Validation Loop:**
```
1. validate_script (syntax check)
2. refresh_unity compile=request (trigger compile)
3. read_console types=error (check for errors)
4. run_tests (if applicable)
5. get_test_job (poll for results)
```

### Stanton Times (Node.js/Twitter)
- **Verify facts:** PTU ≠ LIVE, check source before claiming
- **Test scripts:** Dry-run when possible
- **Pattern source:** Existing scripts in `memory/stanton-times/`
- **Doc location:** `memory/stanton-times/`

### New Projects
- **Establish patterns first:** Before building features, document conventions
- **Create project memory folder:** `memory/[project-name]/`
- **Define verification criteria:** What does "working" mean for this project?

---

## Anti-Patterns (DO NOT)

| Bad | Good |
|-----|------|
| "I've created the file" (no verification) | "File created, compiles clean, integrates with X" |
| "Found 5 issues, here's the list" (report only) | "Found 5 issues, fixed 4, blocked on 1 (needs creds)" |
| "Done" (no evidence) | "Done — verified: compiles ✓, tests pass ✓, docs at X" |
| Assume something works | Test it, prove it works |
| Copy-paste without understanding | Read pattern, understand why, adapt appropriately |
| Leave TODOs | Complete the work or explicitly scope it out |

---

## Verification Checklist (Universal)

Before claiming any task complete:

- [ ] **Compiles/runs** — No syntax errors, no runtime crashes
- [ ] **Follows patterns** — Matches existing code style and architecture
- [ ] **Tested** — You verified it works, not just that it exists
- [ ] **Integrated** — Works with existing systems, no broken references
- [ ] **Documented** — Memory note created with what was done
- [ ] **No regressions** — Didn't break existing functionality

---

## Memory Protocol

All significant work gets documented:

| When | Where | What |
|------|-------|------|
| During work | `memory/[project]/[task].md` | Progress, decisions, blockers |
| On completion | Same file | Final summary, verification results |
| Session end | `memory/YYYY-MM-DD.md` | Day summary if multiple tasks |

---

*This methodology is non-negotiable. Every agent, every task, every time.*
