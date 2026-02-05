#!/bin/bash

# Legacy Project Cleanup Script for Stanton Times

# Directories to investigate
LEGACY_DIRS=(
    "/Users/zachgonser/clawd/projects/stanton-times-agent"
    "/Users/zachgonser/clawd/memory/stanton-times"
    "/Users/zachgonser/clawd/skills/stanton-times"
)

# Archiving destination
ARCHIVE_BASE="/Users/zachgonser/clawd/archives/stanton-times"
ARCHIVE_DIR="${ARCHIVE_BASE}/legacy-$(date +%Y%m%d_%H%M%S)"

# Create archive directory
mkdir -p "$ARCHIVE_DIR"

# Function to safely archive a directory
archive_directory() {
    local source_dir="$1"
    local dir_name=$(basename "$source_dir")
    
    if [ -d "$source_dir" ]; then
        # Tar and compress the directory
        tar -czvf "${ARCHIVE_DIR}/${dir_name}.tar.gz" -C "$(dirname "$source_dir")" "$dir_name"
        
        # Remove original directory
        rm -rf "$source_dir"
        
        echo "Archived and removed: $source_dir"
    fi
}

# Create a manifest of archived contents
echo "Legacy Stanton Times Cleanup - $(date)" > "${ARCHIVE_DIR}/MANIFEST.md"
echo "====================================" >> "${ARCHIVE_DIR}/MANIFEST.md"

# Archive each legacy directory
for dir in "${LEGACY_DIRS[@]}"; do
    echo "Processing: $dir" >> "${ARCHIVE_DIR}/MANIFEST.md"
    archive_directory "$dir"
done

# Clean up any leftover node_modules or temp files
find /Users/zachgonser/clawd -type d -name "node_modules" -path "*/stanton-times*" -exec rm -rf {} +
find /Users/zachgonser/clawd -type f -name "*.log" -path "*/stanton-times*" -delete

echo "Legacy cleanup completed. Archive stored in $ARCHIVE_DIR"