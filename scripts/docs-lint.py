#!/usr/bin/env python3
import json
import re
from pathlib import Path

LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
INLINE_CODE_RE = re.compile(r"`[^`]*`")
FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})")
DIRECTIVE_RE = re.compile(
    r"^\s*(?:[-*+]\s+)?(?:\[[ xX]\]\s+)?(?:>+\s*)?(TODO|TBD|FIXME)\b(?:\s*[:\-].*|\s+.+|\s*)$",
    re.IGNORECASE,
)
HTML_COMMENT_RE = re.compile(r"<!--\s*(TODO|TBD|FIXME)\b", re.IGNORECASE)


def strip_inline_code(line: str) -> str:
    return INLINE_CODE_RE.sub("", line)


def has_placeholder(line: str) -> bool:
    scan_line = strip_inline_code(line)
    if "???" in scan_line:
        return True
    if HTML_COMMENT_RE.search(scan_line):
        return True
    if DIRECTIVE_RE.match(scan_line):
        return True
    return False


def collect_markdown_paths(root: Path) -> list[Path]:
    docs_dir = root / "docs"
    paths = sorted(docs_dir.glob("*.md"))
    paths += sorted((docs_dir / "templates").glob("*.md"))
    readme = root / "README.md"
    if readme.exists():
        paths.append(readme)
    return paths


def validate_docs(root: Path) -> tuple[list[tuple[str, str]], list[tuple[str, int, str]], list[tuple[str, str]]]:
    docs_dir = root / "docs"
    paths = collect_markdown_paths(root)

    missing_links: list[tuple[str, str]] = []
    placeholders: list[tuple[str, int, str]] = []
    invalid_json: list[tuple[str, str]] = []

    for json_path in sorted((docs_dir / "templates").glob("*.json")):
        try:
            json.loads(json_path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - error path only
            invalid_json.append((json_path.name, str(exc)))

    for path in paths:
        text = path.read_text(encoding="utf-8")
        in_fence = False
        fence_marker = ""
        for i, line in enumerate(text.splitlines(), start=1):
            fence_match = FENCE_RE.match(line)
            if fence_match:
                marker = fence_match.group(1)
                marker_char = marker[0]
                marker_len = len(marker)
                if not in_fence:
                    in_fence = True
                    fence_marker = marker_char * marker_len
                else:
                    # Close when marker type matches and closing marker is long enough.
                    if marker_char == fence_marker[0] and marker_len >= len(fence_marker):
                        in_fence = False
                        fence_marker = ""
                continue

            if in_fence:
                continue

            if has_placeholder(line):
                placeholders.append((path.name, i, line.strip()))
        for _, target in LINK_RE.findall(text):
            if target.startswith("http") or target.startswith("#") or target.startswith("mailto:"):
                continue
            target = target.split("#", 1)[0]
            if not target:
                continue
            target_path = (path.parent / target).resolve()
            if not target_path.exists():
                missing_links.append((path.name, target))

    return missing_links, placeholders, invalid_json


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    missing_links, placeholders, invalid_json = validate_docs(root)

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
        return 1

    print("DOCS_LINT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
