#!/bin/bash

# Ensure Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Try NPX installation first
echo "Attempting NPX installation of LM Studio CLI..."
npx lmstudio install-cli

# Fallback to Homebrew
if [ $? -ne 0 ]; then
    echo "NPX installation failed. Attempting Homebrew installation..."
    brew install lm-studio/cli/lms
fi

# Verify installation
echo "Verifying LM Studio CLI installation..."
if command -v lms &> /dev/null; then
    lms --version
    echo "LM Studio CLI successfully installed!"
else
    echo "Installation failed. Please check manually."
    exit 1
fi