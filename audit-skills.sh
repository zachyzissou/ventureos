#!/bin/bash

# Comprehensive Clawdbot Skills Audit Script
# Tests each skill's CLI tools and documents status

SKILLS_DIR="/Users/zachgonser/.npm-global/lib/node_modules/clawdbot/skills"
OUTPUT_FILE="/Users/zachgonser/clawd/skills-audit-data.json"

echo "[" > "$OUTPUT_FILE"
first=true

cd "$SKILLS_DIR"

for skill_dir in */; do
    skill="${skill_dir%/}"
    
    [ "$first" = false ] && echo "," >> "$OUTPUT_FILE"
    first=false
    
    echo "  {" >> "$OUTPUT_FILE"
    echo "    \"skill\": \"$skill\"," >> "$OUTPUT_FILE"
    
    # Check if SKILL.md exists
    if [ ! -f "$skill/SKILL.md" ]; then
        echo "    \"status\": \"no_skill_md\"," >> "$OUTPUT_FILE"
        echo "    \"bins\": []" >> "$OUTPUT_FILE"
        echo "  }" >> "$OUTPUT_FILE"
        continue
    fi
    
    # Extract required bins from metadata (look for the bins array in YAML front matter)
    bins=$(grep -A 5 'requires:' "$skill/SKILL.md" | grep 'bins:' | sed 's/.*bins:\[//' | sed 's/\].*//' | tr -d '"' | tr ',' ' ')
    
    echo "    \"bins_required\": \"$bins\"," >> "$OUTPUT_FILE"
    echo "    \"bins_status\": {" >> "$OUTPUT_FILE"
    
    if [ -z "$bins" ]; then
        echo "      \"none\": \"no bins required\"" >> "$OUTPUT_FILE"
    else
        bin_first=true
        for bin in $bins; do
            [ "$bin_first" = false ] && echo "," >> "$OUTPUT_FILE"
            bin_first=false
            
            # Check if bin exists
            if command -v "$bin" >/dev/null 2>&1; then
                bin_path=$(command -v "$bin")
                echo -n "      \"$bin\": \"found at $bin_path\"" >> "$OUTPUT_FILE"
            else
                echo -n "      \"$bin\": \"not found\"" >> "$OUTPUT_FILE"
            fi
        done
        echo "" >> "$OUTPUT_FILE"
    fi
    
    echo "    }" >> "$OUTPUT_FILE"
    echo "  }" >> "$OUTPUT_FILE"
done

echo "]" >> "$OUTPUT_FILE"

echo "Audit data written to $OUTPUT_FILE"
