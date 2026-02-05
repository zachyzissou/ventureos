#!/bin/bash
# Second Brain Setup Script
# Creates PARA directory structure for OpenClaw workspace

set -e

WORKSPACE="${1:-.}"

openclaw "🧠 Setting up Second Brain in: $WORKSPACE"

# Create directory structure
mkdir -p "$WORKSPACE/memory"
mkdir -p "$WORKSPACE/notes/projects"
mkdir -p "$WORKSPACE/notes/areas"
mkdir -p "$WORKSPACE/notes/resources"
mkdir -p "$WORKSPACE/notes/archive"

openclaw "✓ Created directory structure"

# Create MEMORY.md if it doesn't exist
if [ ! -f "$WORKSPACE/MEMORY.md" ]; then
  cat > "$WORKSPACE/MEMORY.md" << 'EOF'
# MEMORY.md — Long-Term Memory

## About [Human's Name]
- Role: [What they do]
- Goals: [Key objectives]
- Style: [Communication preferences]

## Active Context
- [Current focus areas]

## Preferences
- [Tools and workflows they prefer]

## Lessons Learned
- [Key insights]

---
*Last curated: $(date +%Y-%m-%d)*
EOF
  openclaw "✓ Created MEMORY.md template"
else
  openclaw "• MEMORY.md already exists, skipping"
fi

# Create today's daily log if it doesn't exist
TODAY=$(date +%Y-%m-%d)
if [ ! -f "$WORKSPACE/memory/$TODAY.md" ]; then
  cat > "$WORKSPACE/memory/$TODAY.md" << EOF
# $TODAY

## Morning Context
- Starting fresh with Second Brain setup

## Events

### $(date +%H:%M) — Second Brain Initialized
- Set up PARA structure
- Ready to capture and organize

## Learnings
- 

## Carry Forward
- [ ] 
EOF
  openclaw "✓ Created today's daily log"
else
  openclaw "• Today's log already exists, skipping"
fi

openclaw ""
openclaw "🎉 Second Brain ready!"
openclaw ""
openclaw "Structure:"
openclaw "  $WORKSPACE/"
openclaw "  ├── MEMORY.md          (curated long-term memory)"
openclaw "  ├── memory/"
openclaw "  │   └── $TODAY.md      (daily log)"
openclaw "  └── notes/"
openclaw "      ├── projects/      (active work with deadlines)"
openclaw "      ├── areas/         (ongoing responsibilities)"
openclaw "      ├── resources/     (reference material)"
openclaw "      └── archive/       (completed/inactive)"
openclaw ""
openclaw "Next: Add Second Brain instructions to your AGENTS.md"
