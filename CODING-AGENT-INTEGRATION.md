# Coding Agent Integration Guide
*How to leverage codex-cli and cursor-agent in the development workflow*

## Available Tools

### 1. Codex CLI (`npx codex`)
**OpenAI Codex-powered coding agent**

**Key capabilities:**
- Code generation and refactoring
- Code review
- Diff application
- Local model support (LM Studio, Ollama)
- Sandboxed execution

**Installation:** Already available via `@openai/codex` npm package

### 2. Cursor Agent (`cursor-agent`)
**Cursor AI's coding agent with full tool access**

**Key capabilities:**
- Headless/scriptable mode
- Multiple models (GPT-5, Sonnet-4, Sonnet-4-thinking)
- Plan mode (read-only analysis)
- Ask mode (Q&A, explanations)
- Session resume/continuation

**Installation:** Already available in `~/.local/bin/cursor-agent`

---

## When to Use Each Tool

### Use **Codex CLI** for:

1. **Boilerplate Code Generation**
   ```bash
   npx codex exec "Create a Python FastAPI endpoint for user authentication with JWT"
   ```

2. **Code Reviews**
   ```bash
   npx codex review monitor/healers/gateway_healer.py
   ```

3. **Refactoring Existing Code**
   ```bash
   npx codex exec "Refactor this class to use dependency injection" -i current_code.py
   ```

4. **Test Suite Generation**
   ```bash
   npx codex exec "Generate pytest tests for all functions in models.py" \
     --sandbox workspace-write
   ```

5. **Applying LLM-Generated Diffs**
   ```bash
   # After getting a diff from another LLM
   npx codex apply
   ```

### Use **Cursor Agent** for:

1. **Complex Multi-File Changes**
   ```bash
   cursor-agent --print --full-auto \
     "Add TypeScript types to all JavaScript files in src/"
   ```

2. **Architecture Planning**
   ```bash
   cursor-agent --mode plan \
     "Analyze the Monitor-Agent architecture and suggest improvements"
   ```

3. **Code Explanations**
   ```bash
   cursor-agent --mode ask --print \
     "Explain how the BaseHealer cooldown mechanism works"
   ```

4. **Session-Based Development**
   ```bash
   # Start interactive session for complex task
   cursor-agent "Build a REST API wrapper for the Monitor-Agent"
   
   # Resume later
   cursor-agent --continue
   ```

5. **JSON-Structured Output** (for automation)
   ```bash
   cursor-agent --print --output-format json \
     "List all TODO comments in the codebase"
   ```

---

## Integration Patterns

### Pattern 1: Boilerplate Generation (Codex)

**Use case:** Generating repetitive code structures

```bash
# Generate a new healer implementation
npx codex exec --sandbox workspace-write \
  "Create a new SecurityHealer class following the same pattern as GatewayHealer. \
   It should monitor failed authentication attempts and auto-rotate credentials."
```

**When Echo uses this:**
- Creating new detectors/validators/healers that follow established patterns
- Generating configuration schemas
- Creating new API endpoints
- Building CLI commands

### Pattern 2: Code Review Before Commit (Codex)

**Use case:** Automated code quality check

```bash
# Review all uncommitted changes
git diff | npx codex review

# Or review specific file
npx codex review monitor/monitor/healers/new_healer.py
```

**When Echo uses this:**
- Before committing major changes
- After implementing a new feature
- When quality score needs validation

### Pattern 3: Architecture Analysis (Cursor Agent)

**Use case:** Planning and design validation

```bash
cursor-agent --mode plan --print --output-format json \
  "Review the Phase Zero architecture and identify potential issues"
```

**When Echo uses this:**
- Before starting a new phase
- When stuck on architectural decisions
- For deep code reviews (like we did today)

### Pattern 4: Test Suite Generation (Codex)

**Use case:** Comprehensive test coverage

```bash
npx codex exec --full-auto \
  "Generate unit tests for monitor/healers/security_healer.py with 100% coverage. \
   Use pytest and follow the pattern in test_healers.py"
```

**When Echo uses this:**
- After implementing new modules
- When test coverage is incomplete
- For generating edge case tests

### Pattern 5: Documentation Generation (Cursor Agent)

**use case:** Automated docstring and README updates

```bash
cursor-agent --print --output-format json \
  "Add comprehensive docstrings to all functions in monitor/healers/ \
   following Google style guide"
```

**When Echo uses this:**
- After completing a module
- Before marking a phase complete
- When documentation is lacking

---

## Workflow Integration

### Current Workflow (Without Coding Agents)
```
1. Echo analyzes requirement
2. Echo writes code directly
3. Echo writes tests
4. Echo runs tests
5. Echo commits
```

### Enhanced Workflow (With Coding Agents)

```
1. Echo analyzes requirement
2. **Echo uses Cursor Agent (plan mode) to validate approach**
3. Echo generates boilerplate with Codex
4. Echo customizes the generated code
5. **Echo uses Codex to generate test suite**
6. Echo runs tests
7. **Echo uses Codex review before committing**
8. Echo commits
```

### Sub-Agent Delegation Pattern

**For large/complex features:**

```bash
# Create a cursor-agent session for major feature work
cursor-agent --workspace /Users/zachgonser/clawd/monitor \
  --model sonnet-4-thinking \
  "Implement the Alerter module with Discord and SMS support. \
   Follow the architecture in PHASE-ZERO-EXECUTION.md"

# Resume and check progress
cursor-agent --continue
```

**Echo monitors the session and integrates results** rather than doing all the work.

---

## Configuration

### Codex Configuration (~/.codex/config.toml)

```toml
# Preferred model
model = "gpt-5"

# Default sandbox mode
sandbox_permissions = ["workspace-write"]

# Approval policy
approval_policy = "on-request"  # Model decides when to ask

# Local model fallback
[model_provider]
provider = "oss"  # Use LM Studio when API unavailable
oss_provider = "lmstudio"
```

### Cursor Agent Configuration

```bash
# Set default model
export CURSOR_DEFAULT_MODEL="sonnet-4"

# API key (if needed)
export CURSOR_API_KEY="your-key-here"
```

---

## Examples from Today's Work

### What We Did Manually
```python
# Echo wrote GatewayHealer directly (3.2KB, 10 minutes)
class GatewayHealer(BaseHealer):
    async def heal(self, issue: Issue) -> HealResult:
        # ... implementation ...
```

### What We Could Have Done With Codex
```bash
# Generate the entire healer in 30 seconds
npx codex exec --sandbox workspace-write \
  "Create a GatewayHealer class that inherits from BaseHealer. \
   It should restart the gateway daemon using 'clawdbot gateway stop/start'. \
   Include comprehensive error handling, logging, and a 30s timeout. \
   Follow the same pattern as the BaseHealer in monitor/healer.py"

# Review the generated code
npx codex review monitor/monitor/healers/gateway_healer.py

# Generate tests automatically
npx codex exec --full-auto \
  "Generate unit tests for GatewayHealer following the pattern in test_healers.py"
```

**Time saved:** 10 min → 2 min (5x faster)

---

## Best Practices

### 1. Always Review Generated Code
- Coding agents are fast, but not always correct
- Run tests immediately after generation
- Check for security issues (credentials, permissions)

### 2. Use Sandboxing for Safety
```bash
# Safe: Read-only exploration
npx codex --sandbox read-only "Analyze the codebase structure"

# Safe: Limited writes
npx codex --sandbox workspace-write "Generate tests"

# DANGEROUS: Full access (use sparingly)
npx codex --dangerously-bypass-approvals-and-sandbox "..."
```

### 3. Provide Context
```bash
# Bad: Vague prompt
npx codex exec "Create a healer"

# Good: Specific with context
npx codex exec \
  "Create a SecurityHealer class in monitor/healers/security_healer.py. \
   It should inherit from BaseHealer (see monitor/healer.py). \
   Monitor failed auth attempts and auto-rotate credentials. \
   Follow the same pattern as gateway_healer.py"
```

### 4. Use the Right Tool
- **Codex:** One-shot code generation, reviews, refactoring
- **Cursor Agent:** Interactive sessions, planning, complex multi-file changes

### 5. Integrate Into Quality Gates
```bash
# Before committing
npx codex review <files>

# Before marking phase complete
cursor-agent --mode plan "Review Phase Zero implementation for issues"
```

---

## Quick Reference

### Codex Commands
```bash
# Generate code
npx codex exec [--full-auto] "prompt"

# Review code
npx codex review <file>

# Apply diff
npx codex apply

# Use local model (LM Studio)
npx codex --oss exec "prompt"
```

### Cursor Agent Commands
```bash
# Interactive session
cursor-agent "prompt"

# Headless/scriptable
cursor-agent --print [--output-format json] "prompt"

# Planning mode (read-only)
cursor-agent --mode plan "analyze X"

# Q&A mode
cursor-agent --mode ask "explain X"

# Resume last session
cursor-agent --continue
```

---

## Next Steps

1. **Test Integration:** Use codex for next healer implementation (AlerterModule)
2. **Measure Impact:** Track time saved vs manual implementation
3. **Refine Prompts:** Build a library of effective prompts for common tasks
4. **Automate Quality:** Add codex review to git pre-commit hooks
5. **Document Learnings:** Update this guide with real-world results

---

*Integration added: 2026-01-30*  
*Ready to 10x development velocity with AI-powered coding assistance*
