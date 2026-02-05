import sys
import os
import importlib
import logging

logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s: %(message)s')

def validate_environment():
    """Validate Python environment and package dependencies."""
    logging.info(f"Python Version: {sys.version}")
    logging.info(f"Python Path: {sys.path}")

    required_packages = [
        'plane-mcp-server',
        'plane-sdk',
        'fastmcp',
        'mcp'
    ]

    missing_packages = []
    for package in required_packages:
        try:
            importlib.import_module(package.replace('-', '_'))
            logging.info(f"✓ {package} is installed")
        except ImportError:
            missing_packages.append(package)
            logging.warning(f"✗ {package} is NOT installed")

    if missing_packages:
        logging.error(f"Missing packages: {', '.join(missing_packages)}")
        sys.exit(1)

def configure_project():
    """Configure Plane Platform project settings."""
    project_config = {
        'PROJECT_ID': 'b7824695-65e5-4da6-ba57-3f7ac172266d',
        'BASE_URL': 'http://192.168.225.149:7210',
        'WORKSPACE_SLUG': 'slurpnet',
    }

    # Set environment variables
    for key, value in project_config.items():
        os.environ[key] = value
        logging.info(f"Set {key}: {value}")

def main():
    logging.info("🚀 Initializing Plane Platform Improvements Project")
    validate_environment()
    configure_project()
    logging.info("✨ Initialization Complete")

if __name__ == "__main__":
    main()