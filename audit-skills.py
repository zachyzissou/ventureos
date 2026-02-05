#!/usr/bin/env python3
"""
Comprehensive OpenClaw Skills Audit
Reads each SKILL.md, extracts metadata, tests CLI tools
"""

import json
import os
import subprocess
import re
from pathlib import Path

SKILLS_DIR = Path("/Users/zachgonser/.npm-global/lib/node_modules/openclaw/skills")

def extract_metadata(skill_md_path):
    """Extract metadata from SKILL.md frontmatter"""
    try:
        with open(skill_md_path, 'r') as f:
            content = f.read()
        
        # Find YAML frontmatter
        match = re.search(r'^---\n(.*?)\n---', content, re.DOTALL | re.MULTILINE)
        if not match:
            return None
        
        frontmatter = match.group(1)
        
        # Extract metadata line (it's JSON embedded in YAML)
        metadata_match = re.search(r'metadata:\s*({.*})', frontmatter, re.DOTALL)
        if not metadata_match:
            return None
        
        # Parse JSON metadata
        metadata_json = metadata_match.group(1)
        metadata = json.loads(metadata_json)
        
        return metadata.get('openclaw', {})
    except Exception as e:
        return {'error': str(e)}

def test_bin(bin_name):
    """Test if a binary exists and get its version/help"""
    try:
        # Check if binary exists
        which_result = subprocess.run(['which', bin_name], 
                                     capture_output=True, 
                                     text=True, 
                                     timeout=2)
        
        if which_result.returncode != 0:
            return {'status': 'not_found', 'path': None}
        
        bin_path = which_result.stdout.strip()
        
        # Try to get version
        version = None
        for cmd in [[bin_name, '--version'], [bin_name, '-v'], [bin_name, 'version']]:
            try:
                result = subprocess.run(cmd, 
                                       capture_output=True, 
                                       text=True, 
                                       timeout=5)
                if result.returncode == 0 and result.stdout.strip():
                    version = result.stdout.strip().split('\n')[0][:100]  # First line, max 100 chars
                    break
            except:
                continue
        
        return {
            'status': 'installed',
            'path': bin_path,
            'version': version
        }
    except subprocess.TimeoutExpired:
        return {'status': 'timeout', 'path': None}
    except Exception as e:
        return {'status': 'error', 'path': None, 'error': str(e)}

def test_env_var(var_name):
    """Check if environment variable is set"""
    value = os.environ.get(var_name)
    if value:
        # Mask the value for security
        masked = value[:4] + '...' + value[-4:] if len(value) > 8 else '***'
        return {'status': 'set', 'masked_value': masked}
    return {'status': 'not_set'}

def audit_skill(skill_name):
    """Audit a single skill"""
    skill_dir = SKILLS_DIR / skill_name
    skill_md = skill_dir / "SKILL.md"
    
    result = {
        'skill': skill_name,
        'has_skill_md': skill_md.exists()
    }
    
    if not skill_md.exists():
        result['status'] = 'no_skill_md'
        return result
    
    # Extract metadata
    metadata = extract_metadata(skill_md)
    if metadata is None:
        result['status'] = 'no_metadata'
        return result
    
    if 'error' in metadata:
        result['status'] = 'metadata_error'
        result['error'] = metadata['error']
        return result
    
    result['emoji'] = metadata.get('emoji', '')
    result['requires'] = metadata.get('requires', {})
    result['os'] = metadata.get('os', [])
    
    # Test required bins
    bins = result['requires'].get('bins', [])
    result['bins_test'] = {}
    for bin_name in bins:
        result['bins_test'][bin_name] = test_bin(bin_name)
    
    # Test required env vars
    env_vars = result['requires'].get('env', [])
    result['env_test'] = {}
    for env_var in env_vars:
        result['env_test'][env_var] = test_env_var(env_var)
    
    # Determine overall status
    if bins:
        all_installed = all(test['status'] == 'installed' for test in result['bins_test'].values())
        any_missing = any(test['status'] == 'not_found' for test in result['bins_test'].values())
        
        if all_installed:
            # Check env vars if required
            if env_vars:
                all_env_set = all(test['status'] == 'set' for test in result['env_test'].values())
                result['status'] = 'working' if all_env_set else 'needs_config'
            else:
                result['status'] = 'working'
        elif any_missing:
            result['status'] = 'not_installed'
        else:
            result['status'] = 'partial'
    elif env_vars:
        all_env_set = all(test['status'] == 'set' for test in result['env_test'].values())
        result['status'] = 'working' if all_env_set else 'needs_config'
    else:
        # No requirements
        result['status'] = 'no_requirements'
    
    return result

def main():
    """Run audit on all skills"""
    skills = sorted([d.name for d in SKILLS_DIR.iterdir() if d.is_dir()])
    
    results = []
    for skill in skills:
        print(f"Auditing {skill}...", flush=True)
        results.append(audit_skill(skill))
    
    # Write results
    output_file = Path("/Users/zachgonser/clawd/skills-audit-results.json")
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\nAudit complete! Results written to {output_file}")
    
    # Print summary
    status_counts = {}
    for result in results:
        status = result.get('status', 'unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
    
    print("\nSummary:")
    for status, count in sorted(status_counts.items()):
        print(f"  {status}: {count}")

if __name__ == '__main__':
    main()
