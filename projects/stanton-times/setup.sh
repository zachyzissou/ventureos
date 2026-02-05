#!/bin/bash

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Set up environment variables
cp .env.template .env

# Make scripts executable
chmod +x *.py

echo "Setup complete. Edit .env with your credentials before running."