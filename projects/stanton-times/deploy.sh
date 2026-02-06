#!/bin/bash

# Stanton Times Deployment Script

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Deployment configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${PROJECT_DIR}/.venv"
LOG_DIR="${PROJECT_DIR}/logs"
CONFIG_FILE="${PROJECT_DIR}/config/config.json"

# Logging setup
mkdir -p "${LOG_DIR}"
DEPLOY_LOG="${LOG_DIR}/deployment_$(date +%Y%m%d_%H%M%S).log"

# Deployment steps
deploy() {
    echo -e "${GREEN}Starting Stanton Times deployment...${NC}"

    # Activate virtual environment
    echo "Activating virtual environment..."
    source "${VENV_DIR}/bin/activate"

    # Install/update dependencies
    echo "Installing/updating dependencies..."
    pip install -r "${PROJECT_DIR}/requirements.txt" >> "${DEPLOY_LOG}" 2>&1

    # Run tests
    echo "Running tests..."
    python -m unittest discover "${PROJECT_DIR}/tests" >> "${DEPLOY_LOG}" 2>&1
    TEST_RESULT=$?

    if [ $TEST_RESULT -ne 0 ]; then
        echo -e "${RED}Tests failed. Deployment aborted.${NC}"
        exit 1
    fi

    # Check configuration
    if [ ! -f "${CONFIG_FILE}" ]; then
        echo -e "${RED}Configuration file missing. Please create config/config.json${NC}"
        exit 1
    fi

    # Start background processes
    echo "Starting monitoring processes..."
    nohup python "${PROJECT_DIR}/bird_monitor.py" >> "${LOG_DIR}/bird_monitor.log" 2>&1 &
    nohup python "${PROJECT_DIR}/discord_verifier.py" >> "${LOG_DIR}/discord_verifier.log" 2>&1 &
    nohup python "${PROJECT_DIR}/tweet_publisher.py" >> "${LOG_DIR}/tweet_publisher.log" 2>&1 &

    echo -e "${GREEN}Deployment completed successfully!${NC}"
}

# Rollback function
rollback() {
    echo -e "${RED}Initiating rollback...${NC}"
    # Add rollback logic here if needed
}

# Cleanup function
cleanup() {
    # Remove old log files
    find "${LOG_DIR}" -type f -mtime +30 -delete
}

# Main deployment process
main() {
    trap rollback ERR

    deploy
    cleanup

    echo -e "${GREEN}Deployment and cleanup complete.${NC}"
}

# Run main deployment
main