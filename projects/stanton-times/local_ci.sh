#!/bin/bash

# Local Continuous Integration Script for Stanton Times

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Directories
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${PROJECT_DIR}/.venv"
LOG_DIR="${PROJECT_DIR}/logs"

# Logging
mkdir -p "${LOG_DIR}"
CI_LOG="${LOG_DIR}/ci_$(date +%Y%m%d_%H%M%S).log"

# Activate virtual environment
source "${VENV_DIR}/bin/activate"

# Run tests
run_tests() {
    echo -e "${GREEN}Running unit tests...${NC}"
    python -m unittest discover "${PROJECT_DIR}/tests" | tee "${CI_LOG}"
    return ${PIPESTATUS[0]}
}

# Code quality checks
run_linters() {
    echo -e "${GREEN}Running code quality checks...${NC}"
    pylint "${PROJECT_DIR}"/*.py
    flake8 "${PROJECT_DIR}"/*.py
}

# Security scan
run_security_scan() {
    echo -e "${GREEN}Running security scan...${NC}"
    bandit -r "${PROJECT_DIR}"
}

# Main CI process
main() {
    # Install dev dependencies
    pip install pylint flake8 bandit

    # Run tests
    run_tests
    TEST_RESULT=$?

    # Run additional checks
    run_linters
    run_security_scan

    # Final status
    if [ $TEST_RESULT -eq 0 ]; then
        echo -e "${GREEN}CI checks passed successfully!${NC}"
        exit 0
    else
        echo -e "${RED}CI checks failed. See log: ${CI_LOG}${NC}"
        exit 1
    fi
}

# Execute main CI process
main