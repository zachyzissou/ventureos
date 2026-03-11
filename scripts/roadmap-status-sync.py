#!/usr/bin/env python3
"""
Roadmap status sync check.

Authoritative mapping rules:
1. README "Now (active)" issue IDs must match issue #138 "Now (Active)" issue IDs.
2. Issues listed in active "Now" sets must be OPEN in GitHub.
3. README must reference the roadmap anchor issue (#138 by default).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable

ISSUE_ID_RE = re.compile(r"#(\d+)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check README/roadmap status consistency.")
    parser.add_argument("--readme", default="README.md", help="Path to README file")
    parser.add_argument(
        "--roadmap-issue",
        type=int,
        default=138,
        help="GitHub roadmap anchor issue number (default: 138)",
    )
    parser.add_argument(
        "--roadmap-body-file",
        default="",
        help="Optional local markdown file containing roadmap issue body (test mode)",
    )
    parser.add_argument(
        "--issues-json",
        default="",
        help="Optional JSON file with issue state rows: [{number,state,title}] (test mode)",
    )
    parser.add_argument(
        "--gh-limit",
        type=int,
        default=200,
        help="Max issues fetched when querying GitHub directly (default: 200)",
    )
    return parser.parse_args()


def unique_ordered(values: Iterable[int]) -> list[int]:
    out: list[int] = []
    seen: set[int] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def extract_section(lines: list[str], heading_re: re.Pattern[str], stop_prefix: str) -> list[str]:
    start_index = -1
    for idx, line in enumerate(lines):
        if heading_re.match(line.strip()):
            start_index = idx + 1
            break
    if start_index < 0:
        return []

    section: list[str] = []
    for line in lines[start_index:]:
        stripped = line.strip()
        if stripped.startswith(stop_prefix):
            break
        section.append(line)
    return section


def extract_issue_ids(text: str) -> list[int]:
    return unique_ordered(int(match.group(1)) for match in ISSUE_ID_RE.finditer(text))


def run_json(cmd: list[str]) -> object:
    try:
        output = subprocess.check_output(cmd, text=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"command failed: {' '.join(cmd)} (exit {exc.returncode})") from exc
    return json.loads(output)


def load_roadmap_body(args: argparse.Namespace) -> str:
    if args.roadmap_body_file:
        return Path(args.roadmap_body_file).read_text(encoding="utf-8")
    row = run_json(["gh", "issue", "view", str(args.roadmap_issue), "--json", "body"])
    return str((row or {}).get("body", ""))


def load_issue_state_map(args: argparse.Namespace, issue_ids: list[int]) -> dict[int, dict[str, str]]:
    if args.issues_json:
        rows = json.loads(Path(args.issues_json).read_text(encoding="utf-8"))
        return {
            int(row["number"]): {
                "state": str(row.get("state", "")),
                "title": str(row.get("title", "")),
            }
            for row in rows
        }

    rows = run_json(
        [
            "gh",
            "issue",
            "list",
            "--state",
            "all",
            "--limit",
            str(args.gh_limit),
            "--json",
            "number,state,title",
        ]
    )
    state_map: dict[int, dict[str, str]] = {
        int(row["number"]): {
            "state": str(row.get("state", "")),
            "title": str(row.get("title", "")),
        }
        for row in rows
    }

    for issue_id in issue_ids:
        if issue_id in state_map:
            continue
        row = run_json(
            ["gh", "issue", "view", str(issue_id), "--json", "number,state,title"]
        )
        state_map[int(row["number"])] = {
            "state": str(row.get("state", "")),
            "title": str(row.get("title", "")),
        }
    return state_map


def main() -> int:
    args = parse_args()

    readme_path = Path(args.readme)
    if not readme_path.exists():
        print(f"ERROR: README not found: {readme_path}", file=sys.stderr)
        return 2

    readme_text = readme_path.read_text(encoding="utf-8")
    roadmap_body = load_roadmap_body(args)

    readme_lines = readme_text.splitlines()
    roadmap_lines = roadmap_body.splitlines()

    readme_now_lines = extract_section(
        readme_lines,
        re.compile(r"^###\s+Now\s*\(active\)\s*$", re.IGNORECASE),
        "###",
    )
    roadmap_now_lines = extract_section(
        roadmap_lines,
        re.compile(r"^##\s+Now\s*\(Active\)\s*$", re.IGNORECASE),
        "##",
    )

    if not readme_now_lines:
        print("ERROR: could not find README section: ### Now (active)")
        return 2
    if not roadmap_now_lines:
        print("ERROR: could not find roadmap section: ## Now (Active)")
        return 2

    readme_now_ids = [
        issue_id
        for issue_id in extract_issue_ids("\n".join(readme_now_lines))
        if issue_id != args.roadmap_issue
    ]
    roadmap_now_ids = [
        issue_id
        for issue_id in extract_issue_ids("\n".join(roadmap_now_lines))
        if issue_id != args.roadmap_issue
    ]
    union_ids = unique_ordered(readme_now_ids + roadmap_now_ids)
    state_map = load_issue_state_map(args, union_ids)

    only_in_readme = [issue_id for issue_id in readme_now_ids if issue_id not in roadmap_now_ids]
    only_in_roadmap = [issue_id for issue_id in roadmap_now_ids if issue_id not in readme_now_ids]
    now_not_open: list[int] = []
    missing_state_rows: list[int] = []

    for issue_id in union_ids:
        state = state_map.get(issue_id, {}).get("state", "")
        if not state:
            missing_state_rows.append(issue_id)
            continue
        if state.upper() != "OPEN":
            now_not_open.append(issue_id)

    roadmap_link_ok = bool(
        re.search(rf"issues/{args.roadmap_issue}\b|#\s*{args.roadmap_issue}\b", readme_text)
    )

    print("ROADMAP_SYNC_REPORT")
    print(f"  roadmap_issue:        #{args.roadmap_issue}")
    print(f"  readme_now_ids:       {readme_now_ids}")
    print(f"  roadmap_now_ids:      {roadmap_now_ids}")
    print(f"  only_in_readme_now:   {only_in_readme}")
    print(f"  only_in_roadmap_now:  {only_in_roadmap}")
    print(f"  now_not_open:         {now_not_open}")
    print(f"  missing_issue_rows:   {missing_state_rows}")
    print(f"  readme_links_roadmap: {roadmap_link_ok}")

    if only_in_readme:
        print("MISMATCH: README has active issues not in roadmap Now section.")
    if only_in_roadmap:
        print("MISMATCH: roadmap Now section has issues not in README active section.")
    if now_not_open:
        print("MISMATCH: active issue list contains non-OPEN issues.")
    if missing_state_rows:
        print("MISMATCH: issue state lookup missing rows for active issues.")
    if not roadmap_link_ok:
        print("MISMATCH: README does not reference the roadmap anchor issue.")

    if only_in_readme or only_in_roadmap or now_not_open or missing_state_rows or not roadmap_link_ok:
        print("ROADMAP_STATUS_SYNC_FAIL")
        return 1

    print("ROADMAP_STATUS_SYNC_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
