#!/usr/bin/env python3
"""
Structure Validation Script
Prevents directory structure divergence

Run this before committing to ensure structure is correct.
"""

import sys
from pathlib import Path

MONITOR_ROOT = Path(__file__).parent
EXPECTED_STRUCTURE = {
    "monitor": {
        "required_dirs": ["detectors", "validators", "healers", "alerters"],
        "required_files": ["models.py", "state_db.py", "detector.py", "validator.py", "healer.py", "alerter.py"],
    }
}

FORBIDDEN_PATTERNS = [
    "sys.path.insert",  # No sys.path hacks
    "from detector import",  # Must use monitor.detector
    "from validator import",  # Must use monitor.validator
    "from models import",  # Must use monitor.models
]


def check_directory_structure():
    """Verify monitor/monitor/ contains all required components"""
    monitor_dir = MONITOR_ROOT / "monitor"
    
    if not monitor_dir.exists():
        print("❌ monitor/monitor/ directory does not exist!")
        return False
    
    errors = []
    
    # Check required directories
    for required_dir in EXPECTED_STRUCTURE["monitor"]["required_dirs"]:
        dir_path = monitor_dir / required_dir
        if not dir_path.exists():
            errors.append(f"Missing directory: monitor/{required_dir}/")
    
    # Check required files
    for required_file in EXPECTED_STRUCTURE["monitor"]["required_files"]:
        file_path = monitor_dir / required_file
        if not file_path.exists():
            errors.append(f"Missing file: monitor/{required_file}")
    
    if errors:
        print("❌ Directory Structure Errors:")
        for error in errors:
            print(f"   - {error}")
        return False
    
    print("✅ Directory structure correct")
    return True


def check_for_forbidden_patterns():
    """Scan for forbidden import patterns"""
    errors = []
    
    # Check all Python files in monitor/monitor/
    for py_file in (MONITOR_ROOT / "monitor").rglob("*.py"):
        if py_file.name == "__init__.py":
            continue
        
        with open(py_file, 'r') as f:
            content = f.read()
        
        for pattern in FORBIDDEN_PATTERNS:
            if pattern in content:
                errors.append(f"{py_file.relative_to(MONITOR_ROOT)}: Contains '{pattern}'")
    
    if errors:
        print("❌ Forbidden Pattern Errors:")
        for error in errors:
            print(f"   - {error}")
        return False
    
    print("✅ No forbidden patterns found")
    return True


def check_orphaned_directories():
    """Check for code outside monitor/monitor/"""
    orphaned = []
    
    # Check for detectors/ or validators/ at top level
    if (MONITOR_ROOT / "detectors").exists():
        orphaned.append("detectors/ (should be in monitor/detectors/)")
    
    if (MONITOR_ROOT / "validators").exists():
        orphaned.append("validators/ (should be in monitor/validators/)")
    
    if orphaned:
        print("❌ Orphaned Directories Found:")
        for item in orphaned:
            print(f"   - {item}")
        return False
    
    print("✅ No orphaned directories")
    return True


def main():
    print("=" * 60)
    print("MONITOR-AGENT STRUCTURE VALIDATION")
    print("=" * 60)
    print()
    
    checks = [
        ("Directory Structure", check_directory_structure),
        ("Forbidden Patterns", check_for_forbidden_patterns),
        ("Orphaned Directories", check_orphaned_directories),
    ]
    
    all_passed = True
    
    for check_name, check_func in checks:
        print(f"Checking: {check_name}...")
        if not check_func():
            all_passed = False
        print()
    
    print("=" * 60)
    if all_passed:
        print("✅ ALL CHECKS PASSED")
        print("=" * 60)
        return 0
    else:
        print("❌ VALIDATION FAILED")
        print("=" * 60)
        print("\nFix the issues above before committing.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
