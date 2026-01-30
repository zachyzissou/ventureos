"""Quick quality check of Monitor-Agent code"""
import ast
import sys
from pathlib import Path

issues = []

# Check all Python files
for py_file in Path(".").rglob("*.py"):
    if "venv" in str(py_file):
        continue
    
    try:
        with open(py_file, 'r') as f:
            code = f.read()
            
        # Parse to AST
        tree = ast.parse(code)
        
        # Check for issues
        for node in ast.walk(tree):
            # Check for bare except clauses
            if isinstance(node, ast.ExceptHandler):
                if node.type is None:
                    issues.append(f"{py_file}: Bare except clause (line {node.lineno})")
            
            # Check for print statements (should use logging)
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id == 'print':
                    # Allow in test files
                    if 'test_' not in str(py_file):
                        issues.append(f"{py_file}: print() instead of logging (line {node.lineno})")
                        
    except SyntaxError as e:
        issues.append(f"{py_file}: SYNTAX ERROR - {e}")
    except Exception as e:
        issues.append(f"{py_file}: Parse error - {e}")

if issues:
    print("⚠️  Quality Issues Found:")
    for issue in issues:
        print(f"  - {issue}")
    sys.exit(1)
else:
    print("✅ No obvious quality issues detected")
    sys.exit(0)
