"""
Monitor-Agent Setup
Phase Zero: Architecture Fix

Proper package installation.
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README for long description
readme_file = Path(__file__).parent / "README.md"
long_description = readme_file.read_text() if readme_file.exists() else ""

setup(
    name="monitor-agent",
    version="0.1.0",
    description="Self-healing validation system for Echo",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Echo",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "aiosqlite>=0.19.0",
        "httpx>=0.26.0",
        "python-dotenv>=1.0.0",
        "pyyaml>=6.0.1",
        "discord-webhook>=1.3.0",
        "structlog>=24.1.0",
        "pydantic>=2.5.3",
        "jsonschema>=4.20.0",
    ],
    entry_points={
        "console_scripts": [
            "monitor-agent=monitor.main:main",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
