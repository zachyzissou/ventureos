#!/bin/bash

# Stanton Times Project Maintenance Script

# Directories to clean
CLEANUP_DIRS=(
    "/Users/zachgonser/clawd/projects/stanton-times"
    "/Users/zachgonser/clawd/memory/stanton-times"
)

# Logging
LOG_FILE="/Users/zachgonser/clawd/projects/stanton-times/maintenance.log"
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
    local state_file="/Users/zachgonser/clawd/memory/stanton-times/state.json"
    local archive_dir="/Users/zachgonser/clawd/memory/stanton-times/archives"
    
    # Create archive directory if it doesn't exist
    mkdir -p "$archive_dir"
    
    # Archive old state files
    if [ -f "$state_file" ]; then
        # Use timestamp in filename
        archive_name="state_$(date +%Y%m%d_%H%M%S).json"
        cp "$state_file" "${archive_dir}/${archive_name}"
        
        echo "Archived state file: $archive_name" >> "$LOG_FILE"
    fi
}

# Performance metrics cleanup
rotate_performance_metrics() {
    local metrics_file="/Users/zachgonser/clawd/projects/stanton-times/metrics/tweet_metrics.json"
    local archive_dir="/Users/zachgonser/clawd/projects/stanton-times/metrics/archives"
    
    mkdir -p "$archive_dir"
    
    if [ -f "$metrics_file" ]; then
        # Keep only the last 12 months of metrics
        jq 'map(select(.timestamp > (now | - (365 * 24 * 60 * 60)))' "$metrics_file" > "${metrics_file}.tmp"
        mv "${metrics_file}.tmp" "$metrics_file"
        
        # Create a monthly archive
        archive_name="metrics_$(date +%Y%m).json"
        cp "$metrics_file" "${archive_dir}/${archive_name}"
        
        echo "Rotated performance metrics: $archive_name" >> "$LOG_FILE"
    fi
}

# Main cleanup process
main() {
    # Clean each specified directory
    for dir in "${CLEANUP_DIRS[@]}"; do
        cleanup_files "$dir"
    done
    
    # Rotate state and metrics files
    rotate_state_file
    rotate_performance_metrics
    
    echo "Maintenance completed: $(date)" >> "$LOG_FILE"
}

# Run the maintenance
main