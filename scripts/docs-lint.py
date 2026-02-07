#!/usr/bin/env python3
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
docs_dir = root / "docs"
paths = sorted(docs_dir.glob("*.md"))
# include templates markdown
paths += sorted((docs_dir / "templates").glob("*.md"))
readme = root / "README.md"
if readme.exists():
    paths.append(readme)

link_re = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
placeholder_re = re.compile(r"\b(TODO|TBD|FIXME)\b|\?\?\?")

missing_links = []
placeholders = []
invalid_json = []

# validate template json files
for json_path in sorted((docs_dir / "templates").glob("*.json")):
    try:
        import json
        json.loads(json_path.read_text(encoding="utf-8"))
    except Exception as e:
        invalid_json.append((json_path.name, str(e)))

for path in paths:
    text = path.read_text(encoding="utf-8")
    for i, line in enumerate(text.splitlines(), start=1):
        if placeholder_re.search(line):
            placeholders.append((path.name, i, line.strip()))
    for _, target in link_re.findall(text):
        if target.startswith("http") or target.startswith("#") or target.startswith("mailto:"):
            continue
        target = target.split("#", 1)[0]
        if not target:
            continue
        target_path = (path.parent / target).resolve()
        if not target_path.exists():
            missing_links.append((path.name, target))

failed = False
if missing_links:
    failed = True
    print("Broken links:")
    for fname, target in missing_links:
        print(f"  {fname}: {target}")

if placeholders:
    failed = True
    print("Placeholders found:")
    for fname, line_no, line in placeholders:
        print(f"  {fname}:{line_no}: {line}")

if invalid_json:
    failed = True
    print("Invalid JSON templates:")
    for fname, err in invalid_json:
        print(f"  {fname}: {err}")

if failed:
    sys.exit(1)

print("DOCS_LINT_OK")
