# Local Model Prompting Lessons
**Date:** 2026-02-01
**Model:** Ollama Qwen3:32b
**Task:** Queue Integration

## What Went Wrong

The local model generated good code but failed on execution:
```
Error: ENOENT: no such file or directory, mkdir '/queue'
```

It tried to write to `/queue/queue-manager.js` (absolute path) instead of a proper project path.

## Root Cause Analysis

### My Original Prompt:
```
## Deliverables
- `/queue/queue-manager.js` - Main integration
- `/queue/priority-queue.js` - Priority logic
```

### The Problem:
- Used `/queue/` which looks like an absolute path
- Local models may interpret paths more literally than cloud models
- Qwen doesn't have the same context awareness as Claude/GPT

## Lessons Learned

### 1. Be Explicit About Paths
❌ **Bad:**
```
Deliverables:
- `/queue/queue-manager.js`
```

✅ **Good:**
```
Deliverables:
- Create file at: ./queue/queue-manager.js (relative to current directory)
- Or full path: /Users/zachgonser/clawd/queue/queue-manager.js
```

### 2. Local Models Need More Guidance

**Cloud Models (Claude/GPT):**
- Infer context from conversation
- Understand workspace conventions
- Handle ambiguity well

**Local Models (Qwen/Llama):**
- More literal interpretation
- Need explicit instructions
- May not track workspace context as well

### 3. Validate Tool Usage

Local models might struggle with tool parameters:
```javascript
// Qwen used:
write({ file_path: "/queue/queue-manager.js" })

// Should have been:
write({ path: "./queue/queue-manager.js" })
// OR
write({ content: "...", path: "queue/queue-manager.js" })
```

### 4. Task Complexity vs Model Capability

**Good fit for local models:**
- Code generation with clear specs ✅
- Structured data transformation ✅
- Analysis with defined output ✅

**Better for cloud models:**
- Complex tool orchestration
- Ambiguous requirements
- Multi-step workflows

## Improved Prompting Strategy for Local Models

### Template:
```markdown
## Task: [Clear, specific task]

## Context:
- Working directory: /Users/zachgonser/clawd
- Use relative paths from this directory
- Tool syntax: write(path: "relative/path.js", content: "...")

## Requirements:
[Numbered, explicit requirements]

## Deliverables:
1. Create file: ./subfolder/filename.js
   - Purpose: [what this file does]
   - Key functions: [list them]

## Example tool usage:
write({ path: "./queue/example.js", content: "..." })
```

### Key Improvements:
1. Specify working directory upfront
2. Show example tool usage
3. Use relative paths consistently
4. Include explicit examples

## Performance Observations

**Qwen 32B Performance:**
- Token processing: ~2.3k output tokens
- Time: 3 minutes (vs 30-60s for simpler tasks)
- Quality: Good code structure, proper error handling
- Issue: Tool parameter confusion only

**Comparison:**
- GPT-5.2 Codex: 30s, perfect execution
- Claude Haiku: 60s, flawless
- Qwen 32B: 180s, needed manual fix

## Recommendations for Multi-Model Orchestration

### 1. Task Routing by Clarity
```javascript
if (task.requires_inference || task.has_ambiguity) {
  return 'cloud_model';
} else if (task.is_well_specified && task.is_code_generation) {
  return 'local_model'; // But with explicit prompts
}
```

### 2. Local Model Prompt Enhancer
```javascript
function enhancePromptForLocalModel(prompt) {
  return `
Working Directory: ${process.cwd()}
Use relative paths only.
Tool Parameter Names: path (not file_path), content (not text)

${prompt}

Example tool usage:
- write({ path: "./example.js", content: "code here" })
- read({ path: "./example.js" })
`;
}
```

### 3. Validation Layer
Add a validation step for local model outputs:
```javascript
function validateLocalModelToolCall(toolCall) {
  // Check for absolute paths
  if (toolCall.path?.startsWith('/')) {
    toolCall.path = `.${toolCall.path}`;
  }
  // Fix parameter names
  if (toolCall.file_path) {
    toolCall.path = toolCall.file_path;
    delete toolCall.file_path;
  }
  return toolCall;
}
```

## Conclusion

Local models are powerful for well-defined tasks but need:
1. **Explicit, unambiguous prompts**
2. **Clear examples of expected output**
3. **Validation/correction layers**
4. **Task routing based on complexity**

The key is not avoiding local models, but adapting our prompting strategy to their strengths and limitations. With proper prompting, they can deliver significant cost savings for appropriate tasks.