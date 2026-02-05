# Your Multi-Model Arsenal 🚀
**Updated:** 2026-01-31

## Available Models & Access Methods

### 1. Claude (Anthropic) - $200/mo
```bash
# Direct via OpenClaw
/model claude-opus-4-5        # Most powerful
/model claude-sonnet-4-5      # Balanced
/model claude-3-5-haiku-latest # Fast & cheap

# Via Claude Code CLI
claude "Your prompt"
```

### 2. OpenAI GPT - $20/mo
```bash
# Via OpenClaw + Codex CLI
/model gpt-5.2-codex@openai-codex:codex-cli
/model gpt-5.1@openai-codex:codex-cli

# Direct via Codex CLI
codex exec "Your prompt"
```

### 3. Google Gemini - $20/mo
```bash
# Via OpenClaw
/model gemini-2.5-pro@google-gemini-cli
/model gemini-3-pro-preview@google-gemini-cli

# Direct CLI (1M+ context!)
gemini "Your prompt"
```

### 4. Cursor Agent - $20/mo
```bash
# Standalone agent CLI
agent --print "Your prompt"
agent "Interactive session"

# With custom headers
agent -H "Custom: Value" "Your prompt"
```

### 5. Local Models - FREE
```bash
# Via OpenClaw
/model ollama/qwen3:32b  # 16K context
/model ollama/qwen3:14b  # 8K context
/model ollama/qwen3:8b   # 8K context

# Direct Ollama
ollama run qwen3:32b
```

## Quick Model Selection Guide

| Task | Best Model | Why |
|------|------------|-----|
| Complex reasoning | Claude Opus | Best at nuanced thinking |
| Code generation | GPT-5.2-Codex or Cursor | Specialized for coding |
| Research/Facts | Gemini Pro | 1M context, great at synthesis |
| Quick tasks | Claude Haiku | Fast, cheap, capable |
| Bulk processing | Local Qwen | Free, decent quality |
| Creative writing | GPT-5.2 | Excellent creativity |

## Parallel Execution Pattern

```bash
# Spawn multiple models for same task
sessions_spawn task:"Analyze X" model:"gemini-2.5-pro" label:"gemini"
sessions_spawn task:"Analyze X" model:"gpt-5.2-codex" label:"gpt"
sessions_spawn task:"Analyze X" model:"claude-haiku" label:"claude"

# Compare results
sessions_list kinds:["subagent"] messageLimit:1
```

## Cost Optimization

Total Subscriptions: $260/month
- Claude MAX: $200
- ChatGPT Plus: $20  
- Gemini Advanced: $20
- Cursor Pro: $20

**Strategy:** Use subscriptions first, local models for overflow, APIs only as last resort.

## Quota Tracker

```bash
# Check usage across all subscriptions
./subscription-quota-tracker.js report

# Get model recommendation based on quotas
./subscription-quota-tracker.js recommend

# Track usage after each call
./subscription-quota-tracker.js track anthropic claude-opus-4-5
```