# AI-Assisted Development Framework
*Build a robust system for Codex/Cursor integration*

## The Vision

Instead of manually crafting prompts and running tools, build a **development acceleration framework** that:
- Automates code generation with quality gates
- Learns from successes/failures
- Validates output automatically
- Integrates seamlessly into workflow

**Goal:** 10x development velocity with confidence, not speed with broken code.

---

## The Problem

**Current state (manual, unreliable):**
```bash
# Developer has to:
1. Find the right prompt template
2. Fill in variables manually
3. Set working directory correctly
4. Run codex/cursor with right flags
5. Review generated code manually
6. Fix imports/errors
7. Write tests manually
8. Run tests
9. Commit if it works
```

**Pain points:**
- Requires deep knowledge of our architecture
- Easy to forget steps
- No quality validation
- No learning from past generations
- Slow iteration when things fail

---

## The Solution: Codex/Cursor Orchestration System

### Component 1: CLI Wrapper (`codegen`)

**Simple commands that handle everything:**

```bash
# Generate a new detector
./codegen detector NetworkDetector \
  --checks "ping 8.8.8.8" \
  --severity P1 \
  --category infrastructure

# Generate a new healer
./codegen healer NetworkHealer \
  --fixes "systemctl restart NetworkManager" \
  --cooldown 600 \
  --category infrastructure

# Generate tests for existing module
./codegen tests healers/network_healer.py

# Generate documentation
./codegen docs monitor/healers/
```

**What it does automatically:**
1. Selects appropriate template
2. Injects context (existing code examples)
3. Sets working directory
4. Runs Codex/Cursor with optimal settings
5. Validates output (syntax, imports, patterns)
6. Auto-generates tests
7. Runs test suite
8. Reports quality score
9. Commits if quality > threshold

---

### Component 2: Template Engine

**Smart prompt construction:**

```python
class PromptBuilder:
    def __init__(self, template_type: str):
        self.template = load_template(template_type)
        self.context = {}
    
    def add_example(self, file_path: str):
        """Include existing code as reference"""
        self.context['examples'].append(read_file(file_path))
    
    def add_constraint(self, constraint: str):
        """Add architectural constraints"""
        self.context['constraints'].append(constraint)
    
    def build(self) -> str:
        """Generate final prompt with all context"""
        return self.template.render(**self.context)
```

**Features:**
- Auto-include relevant examples
- Enforce architectural patterns
- Version control (track what prompts work)
- A/B testing (try multiple approaches)

---

### Component 3: Quality Validator

**Automated validation before accepting code:**

```python
class CodeValidator:
    async def validate(self, generated_code: str, target_path: str) -> QualityReport:
        checks = [
            self.syntax_check(),           # Valid Python?
            self.import_check(),           # Imports resolve?
            self.pattern_check(),          # Follows our patterns?
            self.test_generation(),        # Generate + run tests
            self.integration_check(),      # Works with existing code?
            self.security_scan(),          # No vulnerabilities?
        ]
        
        results = await asyncio.gather(*checks)
        score = calculate_score(results)
        
        return QualityReport(
            score=score,
            passed=score > 8.0,
            issues=filter_failures(results),
            recommendations=suggest_fixes(results)
        )
```

**Quality gates:**
- Syntax: Must be valid Python
- Imports: All imports must resolve
- Patterns: Must match existing architecture (AST analysis)
- Tests: Auto-generated tests must pass
- Integration: Must work with existing components
- Security: No obvious vulnerabilities

**Score threshold:** Only accept code with quality > 8.0/10

---

### Component 4: Feedback Loop

**Learn from what works:**

```python
class GenerationTracker:
    def record_attempt(self, prompt: str, result: CodeValidationResult):
        """Track all generation attempts"""
        db.insert({
            'timestamp': now(),
            'prompt': prompt,
            'template': template_name,
            'quality_score': result.score,
            'passed': result.passed,
            'issues': result.issues,
            'time_taken': result.duration
        })
    
    def analyze_patterns(self):
        """Find what prompts/settings work best"""
        return {
            'best_templates': get_highest_scoring_templates(),
            'common_failures': get_frequent_issues(),
            'optimal_settings': get_best_codex_params(),
            'success_rate': calculate_success_rate()
        }
    
    def improve_prompts(self):
        """Auto-refine prompts based on failures"""
        for failure in get_recent_failures():
            if failure.issue == 'wrong_imports':
                add_import_example_to_template()
            elif failure.issue == 'wrong_pattern':
                add_pattern_constraint()
```

**Benefits:**
- Prompts get better over time
- Catch recurring issues automatically
- Optimize for our specific architecture
- Build institutional knowledge

---

### Component 5: Multi-Agent Orchestration

**Use specialized agents for different tasks:**

```bash
# Codex for boilerplate
codex_agent generate detector/healer/alerter

# Cursor for architecture
cursor_agent --mode plan "Review this design"

# Claude for complex logic
claude_agent implement "Complex business logic here"

# Auto-select best agent for task
./codegen auto-select [task]
```

**Agent selection logic:**
```python
def select_agent(task: Task) -> Agent:
    if task.type == 'boilerplate' and task.has_clear_pattern():
        return CodexAgent()  # Fast, pattern-following
    elif task.type == 'architecture' or task.is_complex():
        return CursorAgent(mode='plan')  # Deep analysis
    elif task.requires_reasoning():
        return ClaudeAgent()  # Complex logic
    else:
        return HumanAgent()  # Escalate if uncertain
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           CLI Interface (codegen)               │
│  ./codegen detector|healer|alerter|tests        │
└─────────────────┬───────────────────────────────┘
                  │
         ┌────────▼────────┐
         │  Task Analyzer  │
         │  (what to build)│
         └────────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼────┐  ┌────▼────┐  ┌────▼────┐
│ Codex  │  │ Cursor  │  │ Claude  │
│ Agent  │  │ Agent   │  │ Agent   │
└───┬────┘  └────┬────┘  └────┬────┘
    │            │            │
    └────────────┼────────────┘
                 │
         ┌───────▼────────┐
         │ Code Validator │
         │ (quality check)│
         └───────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼────┐  ┌───▼────┐  ┌───▼────┐
│ Syntax │  │Pattern │  │ Tests  │
│ Check  │  │ Check  │  │ Check  │
└───┬────┘  └───┬────┘  └───┬────┘
    │           │           │
    └───────────┼───────────┘
                │
         ┌──────▼─────────┐
         │ Quality Score  │
         │   (> 8.0?)     │
         └──────┬─────────┘
                │
       ┌────────┴────────┐
       │                 │
   ┌───▼────┐      ┌────▼────┐
   │ Accept │      │ Reject  │
   │ Commit │      │ Refine  │
   └────────┘      └─────┬───┘
                         │
                   ┌─────▼─────┐
                   │ Feedback  │
                   │  Loop     │
                   │ (improve) │
                   └───────────┘
```

---

## Implementation Plan

### Phase 1: Core CLI (Week 1)
**Goal:** Basic wrapper that works

- [ ] `codegen` CLI tool skeleton
- [ ] Template loader (read from CODING-AGENT-PROMPTS.md)
- [ ] Basic Codex integration
- [ ] Simple validation (syntax + imports)
- [ ] Manual test generation

**Output:** Working MVP that generates code with basic validation

---

### Phase 2: Quality Gates (Week 2)
**Goal:** Automated quality validation

- [ ] AST-based pattern matching
- [ ] Auto-generate tests from code
- [ ] Run test suite automatically
- [ ] Quality scoring system
- [ ] Accept/reject logic

**Output:** Confident code generation (only accept quality > 8.0)

---

### Phase 3: Multi-Agent (Week 3)
**Goal:** Orchestrate multiple AI tools

- [ ] Cursor Agent integration
- [ ] Claude integration
- [ ] Agent selection logic
- [ ] Task complexity analysis
- [ ] Fallback chains

**Output:** Use the right tool for each task automatically

---

### Phase 4: Feedback Loop (Week 4)
**Goal:** Self-improving system

- [ ] Generation tracking database
- [ ] Pattern analysis
- [ ] Prompt auto-refinement
- [ ] Success rate monitoring
- [ ] Template optimization

**Output:** System that gets better over time

---

## Success Metrics

**Developer Experience:**
- Time to generate new module: <2 min (vs 10-30 min manual)
- Quality of generated code: >8.0/10 consistently
- Test coverage: 100% auto-generated
- Manual fixes needed: <10% of generations

**System Performance:**
- Success rate: >90% on first try
- False positive rate: <5% (accept bad code)
- False negative rate: <10% (reject good code)
- Iteration speed: <30s per attempt

**Long-term:**
- Prompt improvement: +10% success rate per month
- Coverage: Handles 80% of routine dev tasks
- Confidence: Developers trust output without deep review

---

## Example Workflow

**Before (manual, 30 min):**
```bash
# Developer manually:
1. Read CODING-AGENT-PROMPTS.md
2. Copy template, fill in variables
3. cd /Users/zachgonser/clawd/monitor/healers
4. npx codex exec -C . "long prompt..."
5. Wait for output
6. Fix imports manually
7. Write tests manually (test_new_healer.py)
8. Run tests, debug failures
9. Commit after manual review
```

**After (automated, 2 min):**
```bash
./codegen healer NetworkHealer \
  --fixes "systemctl restart NetworkManager" \
  --cooldown 600

# System automatically:
# ✅ Selected healer template
# ✅ Injected gateway_healer.py as example
# ✅ Generated network_healer.py
# ✅ Validated syntax (passed)
# ✅ Validated imports (passed)
# ✅ Validated patterns (passed)
# ✅ Generated test_network_healer.py
# ✅ Ran tests (5/5 passed)
# ✅ Quality score: 9.2/10 ✅
# ✅ Committed to git
# 
# Ready to use! 🚀
```

**Time saved:** 28 minutes per component × 10+ components = **4+ hours saved**

---

## Why This Matters

**This isn't just about Monitor-Agent.**

This is a **reusable development framework** that works for:
- StantonTimes automation
- Bloom game development
- Any future projects
- Could be a PRODUCT (AI-assisted dev tool)

**The meta-strategy:**
1. Build tools that make building faster
2. Use those tools to build more tools
3. Compound velocity over time

**This is exactly the kind of infrastructure investment that pays dividends forever.**

---

## Decision Point

**Should we build this?**

**Option A: Build it NOW** (pause Day 6 Phase Zero)
- Pro: Accelerate all future development
- Pro: Use it immediately for Days 6-7
- Pro: Test it on real work
- Con: Delays Phase Zero completion
- Con: Context switching cost
- **Time:** 1-2 weeks for MVP

**Option B: Build it AFTER Phase Zero** (finish Days 6-7 first)
- Pro: Complete Phase Zero first (maintain momentum)
- Pro: Can use lessons from Day 6-7 to inform design
- Con: Don't get benefits until later
- Con: Might forget or deprioritize
- **Time:** Phase Zero done in 1-1.5 hours, then 1-2 weeks for this

**Option C: Build it in PARALLEL** (sub-agent)
- Pro: Both happen simultaneously
- Pro: Don't lose Phase Zero momentum
- Pro: Framework ready when Phase Zero done
- Con: More complex coordination
- Con: Need to define interface carefully
- **Time:** Both complete in 1-2 weeks

---

## My Recommendation

**Option C: Parallel Development**

**Why:**
- Phase Zero is almost done (1-1.5 hours)
- This framework is BIG (1-2 weeks)
- They don't block each other
- Maximum velocity

**Execution:**
1. I continue Day 6-7 manually (finish Phase Zero today)
2. Spawn a sub-agent for AI-Dev-Framework
3. Framework ready by next week
4. Use it for Phase 1+ development

**Alternative:** If you want to see this framework ASAP, we pause Day 6 and build it now. Your call.

---

*Created: 2026-01-30*  
*Status: Proposal - awaiting decision*
