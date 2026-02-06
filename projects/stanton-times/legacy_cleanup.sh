#!/bin/bash

# Legacy Project Cleanup Script for Stanton Times

BASE_DIR="${HOME}/clawd"

# Directories to investigate
LEGACY_DIRS=(
    "${BASE_DIR}/projects/stanton-times-agent"
    "${BASE_DIR}/memory/stanton-times"
    "${BASE_DIR}/skills/stanton-times"
)

# Archiving destination
ARCHIVE_BASE="${BASE_DIR}/archives/stanton-times"
ARCHIVE_DIR="${ARCHIVE_BASE}/legacy-$(date +%Y%m%d_%H%M%S)"

# Create archive directory
mkdir -p "$ARCHIVE_DIR"

# Function to safely archive a directory
archive_directory() {
    local source_dir="$1"
    local dir_name=$(basename "$source_dir")

    if [ -d "$source_dir" ]; then
        tar -czvf "${ARCHIVE_DIR}/${dir_name}.tar.gz" -C "$(dirname "$source_dir")" "$dir_name"
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
find "${BASE_DIR}" -type d -name "node_modules" -path "*/stanton-times*" -exec rm -rf {} +
find "${BASE_DIR}" -type f -name "*.log" -path "*/stanton-times*" -delete

echo "Legacy cleanup completed. Archive stored in $ARCHIVE_DIR"
