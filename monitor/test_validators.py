"""
Validator Tests
Phase Zero Day 3: Data Validators

Simple tests to verify validators work correctly.
"""

import asyncio
import yaml
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from validators.memory_validator import MemoryValidator
from validators.state_validator import StateValidator
from validators.obsidian_validator import ObsidianValidator
from validators.git_validator import GitValidator


async def test_memory_validator():
    """Test memory system validation"""
    print("\n=== Testing Memory Validator ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    validator = MemoryValidator(config)
    
    # Run validation
    issue = await validator.validate()
    if issue:
        print(f"⚠️  Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
        print(f"   Can auto-fix: {issue.can_auto_fix}")
    else:
        print("✅ Memory system is healthy")


async def test_state_validator():
    """Test state file validation"""
    print("\n=== Testing State Validator ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    validator = StateValidator(config)
    
    # Run validation
    issue = await validator.validate()
    if issue:
        print(f"⚠️  Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
        print(f"   File: {issue.metadata.get('file')}")
    else:
        print("✅ All state files are healthy")


async def test_obsidian_validator():
    """Test Obsidian sync validation"""
    print("\n=== Testing Obsidian Validator ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    validator = ObsidianValidator(config)
    
    # Run validation
    issue = await validator.validate()
    if issue:
        print(f"⚠️  Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
        if 'hours_since_extraction' in issue.metadata:
            print(f"   Hours since extraction: {issue.metadata['hours_since_extraction']:.1f}")
    else:
        print("✅ Obsidian sync is healthy")


async def test_git_validator():
    """Test git status validation"""
    print("\n=== Testing Git Validator ===")
    
    with open("config/config.yaml", 'r') as f:
        config = yaml.safe_load(f)
    
    validator = GitValidator(config)
    
    # Run validation
    issue = await validator.validate()
    if issue:
        print(f"⚠️  Issue detected: {issue.message}")
        print(f"   Severity: {issue.severity}")
        if 'num_files' in issue.metadata:
            print(f"   Uncommitted files: {issue.metadata['num_files']}")
    else:
        print("✅ Git status is clean")


async def main():
    """Run all validator tests"""
    print("=" * 60)
    print("PHASE ZERO DAY 3: Data Validator Tests")
    print("=" * 60)
    
    try:
        await test_memory_validator()
        await test_state_validator()
        await test_obsidian_validator()
        await test_git_validator()
        
        print("\n" + "=" * 60)
        print("✅ All validator tests complete")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Test suite failed: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
