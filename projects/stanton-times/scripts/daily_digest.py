import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import sqlite3

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import get_db_path, PROJECT_ROOT


def _ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def _query(conn, sql, params=()):
    cur = conn.cursor()
    cur.execute(sql, params)
    return cur.fetchall()


def generate_digest():
    db_path = str(get_db_path())
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    now = datetime.utcnow()
    since = (now - timedelta(days=1)).isoformat()
    day_label = now.date().isoformat()

    totals = _query(
        conn,
        """
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'drafted' THEN 1 ELSE 0 END) as drafted,
            SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
            SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
        FROM items
        WHERE created_at >= ?
        """,
        (since,),
    )[0]

    clusters = _query(
        conn,
        """
        SELECT c.cluster_id, c.title, c.source, c.last_seen, c.last_draft_at, c.last_published_at,
               COUNT(i.id) as item_count
        FROM clusters c
        JOIN items i ON i.cluster_id = c.cluster_id
        WHERE i.created_at >= ?
        GROUP BY c.cluster_id
        ORDER BY item_count DESC, c.last_seen DESC
        LIMIT 12
        """,
        (since,),
    )

    reports_dir = PROJECT_ROOT / "reports" / "digests"
    _ensure_dir(reports_dir)
    digest_path = reports_dir / f"{day_label}.md"

    lines = [
        f"# Stanton Times Daily Digest — {day_label}",
        "",
        "## Summary (last 24h)",
        f"- Items ingested: {totals['total']}",
        f"- Drafts created: {totals['drafted']}",
        f"- Published: {totals['published']}",
        f"- Archived: {totals['archived']}",
        "",
        "## Top clusters",
    ]

    if not clusters:
        lines.append("- No clusters recorded in the last 24h.")
    else:
        for row in clusters:
            title = row["title"] or "Untitled"
            source = row["source"] or "Unknown"
            item_count = row["item_count"]
            last_seen = row["last_seen"] or ""
            lines.append(
                f"- **{title}** ({source}) — {item_count} items · last seen {last_seen}"
            )

    digest_path.write_text("\n".join(lines) + "\n")

    # Also update a rolling dashboard
    dashboard_path = PROJECT_ROOT / "reports" / "dashboard.md"
    _ensure_dir(dashboard_path.parent)
    dashboard_lines = [
        "# Stanton Times Dashboard",
        "",
        f"Last updated: {now.isoformat()} UTC",
        "",
        "## Last 24h Summary",
        f"- Items ingested: {totals['total']}",
        f"- Drafts created: {totals['drafted']}",
        f"- Published: {totals['published']}",
        f"- Archived: {totals['archived']}",
        "",
        "## Top clusters (24h)",
    ]
    if not clusters:
        dashboard_lines.append("- No clusters recorded in the last 24h.")
    else:
        for row in clusters:
            title = row["title"] or "Untitled"
            source = row["source"] or "Unknown"
            item_count = row["item_count"]
            dashboard_lines.append(f"- **{title}** ({source}) — {item_count} items")

    dashboard_path.write_text("\n".join(dashboard_lines) + "\n")
    conn.close()
    return str(digest_path)


def main():
    path = generate_digest()
    print(f"Digest written: {path}")


if __name__ == "__main__":
    main()
