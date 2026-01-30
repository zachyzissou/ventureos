# Obsidian Vault Cleanup - Master Plan

**Created:** 2026-01-27
**Status:** Planning

## Problem Assessment

| Issue | Count | Priority |
|-------|-------|----------|
| Duplicate filenames (same name, multiple folders) | 262 sets | HIGH |
| Orphan `cite` references (ChatGPT artifacts) | 225 files | MEDIUM |
| "Great question!" personality bleed | 30 files | LOW |
| `search_query` JSON artifacts | 27 files | MEDIUM |
| Corrupted frontmatter (tags) | 5 files | HIGH |
| Personal content in tech folders | ~59 files | MEDIUM |
| Tech content in General folder | ~65 files | LOW |

**Total articles:** 1,630

---

## Phase 1: Deduplication (CRITICAL)

**Goal:** Resolve 262 duplicate filename sets

**Strategy:**
1. For each duplicate set, compare file contents
2. If identical content → keep one, delete others
3. If different content → rename with suffix or merge
4. Log all decisions

**Sub-agent instructions:**
```
TASK: Deduplicate vault articles

LOCATION: C:\Users\Zachg\Documents\VaultZap\Mind Map\Articles

PROCESS:
1. Find all files with duplicate names across folders
2. For each duplicate set:
   a. Read all copies
   b. Compare content (ignore frontmatter dates)
   c. If >90% similar: keep the longest/most complete version, trash others
   d. If genuinely different: append folder name to filename (e.g., "Topic - Gaming.md")
3. Output: dedup-report.md with all decisions

VALIDATION: After completion, confirm zero duplicate filenames remain

DO NOT delete files - move to META/Trash/ for review
```

---

## Phase 2: Artifact Cleanup

**Goal:** Remove ChatGPT garbage from content

**Patterns to remove:**
- ` cite` or ` cite ` (orphan citations with no reference)
- `citeturn\d+\w+` patterns
- `{"search_query":...}` JSON blocks  
- `Great question!` and similar personality phrases
- `I'd be happy to help!`
- `Absolutely!` at start of paragraphs

**Sub-agent instructions:**
```
TASK: Clean ChatGPT artifacts from articles

LOCATION: C:\Users\Zachg\Documents\VaultZap\Mind Map\Articles

PATTERNS TO REMOVE (regex):
1. /\s*cite(?:turn\d+\w*)?(?:\s|$)/g → remove entirely
2. /\{"search_query":\s*\[.*?\]\}/gs → remove entire JSON block
3. /^(Great question!|Absolutely!|I'd be happy to help!)\s*/gm → remove
4. /\s+$/ → trim trailing whitespace

PROCESS:
1. Scan all .md files
2. Apply regex replacements
3. Only write file if changes were made
4. Log: filename, patterns found, patterns removed

VALIDATION: 
- Re-scan for patterns after completion
- Report should show 0 remaining matches

OUTPUT: artifact-cleanup-report.md
```

---

## Phase 3: Frontmatter Repair

**Goal:** Fix 5 files with corrupted YAML frontmatter

**Sub-agent instructions:**
```
TASK: Repair corrupted frontmatter

FILES WITH ISSUES:
- AI/LLM/Music prompt creation.md
- AI/LLM/Star Citizen RSS Feeds.md
- AI/LLM/Top Instant Espresso Picks.md
- DevOps/Linux/Best GPU on market.md
- DevOps/Unraid/AI Desktop PC Options.md
- DevOps/Unraid/Stylish Hats for XL Heads.md
- General/Barberbeats song prompt.md
- Hardware/NVIDIA Tesla M10 for LLMs.md

PROCESS:
1. Read each file
2. Parse frontmatter (between --- markers)
3. Fix common issues:
   - Tags containing ** or other markdown
   - Content leaking into frontmatter
   - Malformed YAML arrays
4. Validate YAML parses correctly
5. Write corrected file

OUTPUT: frontmatter-repair-report.md
```

---

## Phase 4: Category Correction

**Goal:** Move misplaced content to correct folders

**Strategy:** Content-based classification, not filename-based

**Sub-agent instructions:**
```
TASK: Recategorize misplaced articles

RULES:
- Personal topics (THCa, cannabis, fashion, recipes, travel, health/diet, hobbies) → Personal/[subcategory]
- Gaming content → Gaming/[subcategory]
- Star Citizen specifically → Gaming/StarCitizen
- Docker/Unraid/Linux admin → DevOps/[subcategory]
- Programming (Unity, Python, JS) → Development/[subcategory]
- AI/LLM/Image generation → AI/[subcategory]
- Hardware discussions → Hardware/
- General knowledge → General/

PROCESS:
1. For each file in tech folders (Development, DevOps, AI):
   - Read first 500 chars of content (after frontmatter)
   - Classify based on actual topic, not current folder
   - If mismatch detected, move to correct folder
   - Update frontmatter category field
2. Do the same for General/ - move tech content out

VALIDATION:
- Spot-check 20 random files after move
- Confirm category matches content

OUTPUT: recategorization-report.md
```

---

## Phase 5: Quality Validation

**Goal:** Verify cleanup was successful

**Sub-agent instructions:**
```
TASK: Validate vault quality

CHECKS:
1. Zero duplicate filenames
2. Zero remaining artifact patterns (cite, search_query, etc.)
3. All frontmatter parses as valid YAML
4. Random sample of 50 files:
   - Category matches content
   - No obvious garbage in body
   - Frontmatter complete (title, created, category, tags)

OUTPUT: validation-report.md with PASS/FAIL and details
```

---

## Execution Order

1. **Phase 1 (Dedup)** - Must complete first, affects file counts
2. **Phase 2 (Artifacts)** - Can run after dedup
3. **Phase 3 (Frontmatter)** - Quick, targeted fixes
4. **Phase 4 (Categories)** - Biggest lift, needs careful validation
5. **Phase 5 (Validation)** - Final check before declaring done

---

## Success Criteria

- [ ] Zero duplicate filenames
- [ ] Zero ChatGPT artifacts in content
- [ ] All frontmatter valid YAML
- [ ] Category matches content for >95% of files
- [ ] Human spot-check passes
