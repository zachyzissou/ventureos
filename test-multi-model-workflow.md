# Test Multi-Model Workflow

## Workflow: Research & Report Generation

### Step 1: Research Phase (Parallel)
```bash
# Spawn GPT for web research
sessions_spawn task:"Research the latest developments in quantum computing startups in 2026" model:"openai-codex/gpt-5.2-codex" label:"research-gpt"

# Spawn Gemini for academic sources
sessions_spawn task:"Find recent academic papers on quantum computing breakthroughs in 2026" model:"google-gemini-cli/gemini-2.5-pro" label:"research-gemini"

# Spawn Qwen for cost analysis
sessions_spawn task:"Analyze the cost implications of quantum computing adoption for enterprises" model:"ollama/qwen3:32b" label:"analysis-qwen"
```

### Step 2: Synthesis Phase
Wait for results, then:
```bash
# Spawn Claude to synthesize
sessions_spawn task:"Synthesize these research findings into a executive brief: [results from all 3]" model:"anthropic/claude-opus-4-5" label:"synthesis"
```

### Step 3: Orchestrate from Main
- Monitor progress
- Handle failures with fallbacks
- Aggregate final results

## Benefits
- **Parallel processing** - 3x faster than sequential
- **Model specialization** - Each model doing what it's best at
- **Cost optimization** - Local model for analysis (free)
- **Subscription usage** - Maximizing what you already pay for