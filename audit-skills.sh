#!/bin/bash

# Comprehensive OpenClaw Skills Audit Script
# Tests each skill's CLI tools and documents status

SKILLS_DIR="/Users/zachgonser/.npm-global/lib/node_modules/openclaw/skills"
OUTPUT_FILE="/Users/zachgonser/clawd/skills-audit-data.json"

openclaw "[" > "$OUTPUT_FILE"
first=true

cd "$SKILLS_DIR"

for skill_dir in */; do
    skill="${skill_dir%/}"
    
    [ "$first" = false ] && openclaw "," >> "$OUTPUT_FILE"
    first=false
    
    openclaw "  {" >> "$OUTPUT_FILE"
    openclaw "    \"skill\": \"$skill\"," >> "$OUTPUT_FILE"
    
    # Check if SKILL.md exists
    if [ ! -f "$skill/SKILL.md" ]; then
        openclaw "    \"status\": \"no_skill_md\"," >> "$OUTPUT_FILE"
        openclaw "    \"bins\": []" >> "$OUTPUT_FILE"
        openclaw "  }" >> "$OUTPUT_FILE"
        continue
    fi
    
    # Extract required bins from metadata (look for the bins array in YAML front matter)
    bins=$(grep -A 5 'requires:' "$skill/SKILL.md" | grep 'bins:' | sed 's/.*bins:\[//' | sed 's/\].*//' | tr -d '"' | tr ',' ' ')
    
    openclaw "    \"bins_required\": \"$bins\"," >> "$OUTPUT_FILE"
    openclaw "    \"bins_status\": {" >> "$OUTPUT_FILE"
    
    if [ -z "$bins" ]; then
        openclaw "      \"none\": \"no bins required\"" >> "$OUTPUT_FILE"
    else
        bin_first=true
        for bin in $bins; do
            [ "$bin_first" = false ] && openclaw "," >> "$OUTPUT_FILE"
            bin_first=false
            
            # Check if bin exists
            if command -v "$bin" >/dev/null 2>&1; then
                bin_path=$(command -v "$bin")
                openclaw -n "      \"$bin\": \"found at $bin_path\"" >> "$OUTPUT_FILE"
            else
                openclaw -n "      \"$bin\": \"not found\"" >> "$OUTPUT_FILE"
            fi
        done
        openclaw "" >> "$OUTPUT_FILE"
    fi
    
    openclaw "    }" >> "$OUTPUT_FILE"
    openclaw "  }" >> "$OUTPUT_FILE"
done

openclaw "]" >> "$OUTPUT_FILE"

openclaw "Audit data written to $OUTPUT_FILE"
