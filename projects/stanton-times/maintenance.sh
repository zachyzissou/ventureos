#!/bin/bash

# Stanton Times Project Maintenance Script

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="${PROJECT_DIR}/data/state.json"
ARCHIVE_DIR="${PROJECT_DIR}/archives"
METRICS_FILE="${PROJECT_DIR}/metrics/tweet_metrics.json"
METRICS_ARCHIVE_DIR="${PROJECT_DIR}/metrics/archives"

# Directories to clean
CLEANUP_DIRS=(
    "${PROJECT_DIR}"
)

# Logging
LOG_FILE="${PROJECT_DIR}/maintenance.log"
echo "Maintenance started: $(date)" >> "$LOG_FILE"

# Cleanup functions
cleanup_files() {
    local dir="$1"
    echo "Cleaning up $dir" >> "$LOG_FILE"

    # Remove old log files (>30 days)
    find "$dir" -type f \( -name "*.log" -o -name "*.tmp" -o -name "*.bak" \) -mtime +30 -delete

    # Remove Python cache files
    find "$dir" -type d -name "__pycache__" -exec rm -rf {} +
    find "$dir" -type f -name "*.pyc" -delete

    # Remove node_modules directories
    find "$dir" -type d -name "node_modules" -exec rm -rf {} +
}

# State file maintenance
rotate_state_file() {
    # Create archive directory if it doesn't exist
    mkdir -p "$ARCHIVE_DIR"

    # Archive old state files
    if [ -f "$STATE_FILE" ]; then
        archive_name="state_$(date +%Y%m%d_%H%M%S).json"
        cp "$STATE_FILE" "${ARCHIVE_DIR}/${archive_name}"
        echo "Archived state file: $archive_name" >> "$LOG_FILE"
    fi
}

# Performance metrics cleanup
rotate_performance_metrics() {
    mkdir -p "$METRICS_ARCHIVE_DIR"

    if [ -f "$METRICS_FILE" ]; then
        jq 'map(select(.timestamp > (now | - (365 * 24 * 60 * 60))))' "$METRICS_FILE" > "${METRICS_FILE}.tmp"
        mv "${METRICS_FILE}.tmp" "$METRICS_FILE"

        archive_name="metrics_$(date +%Y%m).json"
        cp "$METRICS_FILE" "${METRICS_ARCHIVE_DIR}/${archive_name}"
        echo "Rotated performance metrics: $archive_name" >> "$LOG_FILE"
    fi
}

# Main cleanup process
main() {
    for dir in "${CLEANUP_DIRS[@]}"; do
        cleanup_files "$dir"
    done

    rotate_state_file
    rotate_performance_metrics

    echo "Maintenance completed: $(date)" >> "$LOG_FILE"
}

# Run the maintenance
main
