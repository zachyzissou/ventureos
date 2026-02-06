import hashlib
import os
import re
import sqlite3
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Iterable, Optional, Tuple

from src.config import get_db_path


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text.lower())
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize(text: str) -> Iterable[str]:
    return [t for t in normalize_text(text).split() if len(t) > 2]


def compute_simhash(text: str, bits: int = 64) -> int:
    tokens = _tokenize(text)
    if not tokens:
        return 0
    v = [0] * bits
    for token in tokens:
        h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        for i in range(bits):
            v[i] += 1 if (h >> i) & 1 else -1
    fingerprint = 0
    for i in range(bits):
        if v[i] > 0:
            fingerprint |= 1 << i
    # SQLite INTEGER is signed 64-bit. Store a signed representation to avoid
    # OverflowError when the unsigned simhash has the high bit set.
    mask = (1 << bits) - 1
    fingerprint &= mask
    sign_bit = 1 << (bits - 1)
    if fingerprint & sign_bit:
        fingerprint -= 1 << bits
    return fingerprint


def hamming_distance(a: int, b: int, bits: int = 64) -> int:
    mask = (1 << bits) - 1
    return bin((a ^ b) & mask).count("1")


@dataclass
class LedgerItem:
    item_id: int
    cluster_id: str
    duplicate: bool


class StantonTimesLedger:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = str(db_path or get_db_path())
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self):
        cur = self.conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS clusters (
                cluster_id TEXT PRIMARY KEY,
                canonical_text TEXT,
                canonical_hash TEXT,
                canonical_simhash INTEGER,
                title TEXT,
                source TEXT,
                first_seen TEXT,
                last_seen TEXT,
                item_count INTEGER,
                last_draft_at TEXT,
                last_published_at TEXT
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT,
                title TEXT,
                url TEXT,
                published_at TEXT,
                normalized_text TEXT,
                text_hash TEXT,
                simhash INTEGER,
                cluster_id TEXT,
                priority TEXT,
                tier TEXT,
                status TEXT,
                draft_text TEXT,
                draft_hash TEXT,
                tweet_id TEXT,
                created_at TEXT
            );
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_items_hash ON items(text_hash);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_items_cluster ON items(cluster_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_clusters_last_seen ON clusters(last_seen);")
        self.conn.commit()

    def _text_hash(self, text: str) -> str:
        return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()

    def _find_cluster(self, simhash: int, window_days: int, threshold: int) -> Optional[sqlite3.Row]:
        cutoff = (datetime.utcnow() - timedelta(days=window_days)).isoformat()
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT * FROM clusters
            WHERE last_seen >= ?
            """,
            (cutoff,),
        )
        rows = cur.fetchall()
        best = None
        best_dist = None
        for row in rows:
            dist = hamming_distance(simhash, row["canonical_simhash"] or 0)
            if dist <= threshold and (best_dist is None or dist < best_dist):
                best = row
                best_dist = dist
        return best

    def ingest_item(
        self,
        source: str,
        title: str,
        description: str,
        url: str,
        published_at: Optional[str],
        priority: Optional[str],
        tier: Optional[str],
        cluster_window_days: int = 7,
        simhash_threshold: int = 8,
    ) -> LedgerItem:
        text = f"{title} {description}"
        normalized = normalize_text(text)
        text_hash = self._text_hash(normalized)
        simhash = compute_simhash(normalized)
        published_at = published_at or _now_iso()

        cur = self.conn.cursor()
        cur.execute("SELECT id, cluster_id FROM items WHERE text_hash = ? LIMIT 1", (text_hash,))
        existing = cur.fetchone()
        duplicate = bool(existing)

        cluster = self._find_cluster(simhash, cluster_window_days, simhash_threshold)
        if cluster:
            cluster_id = cluster["cluster_id"]
            cur.execute(
                """
                UPDATE clusters
                SET last_seen = ?, item_count = item_count + 1
                WHERE cluster_id = ?
                """,
                (_now_iso(), cluster_id),
            )
        else:
            cluster_id = uuid.uuid4().hex[:12]
            cur.execute(
                """
                INSERT INTO clusters (
                    cluster_id, canonical_text, canonical_hash, canonical_simhash,
                    title, source, first_seen, last_seen, item_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cluster_id,
                    normalized,
                    text_hash,
                    simhash,
                    title,
                    source,
                    _now_iso(),
                    _now_iso(),
                    1,
                ),
            )

        cur.execute(
            """
            INSERT INTO items (
                source, title, url, published_at, normalized_text, text_hash, simhash,
                cluster_id, priority, tier, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source,
                title,
                url,
                published_at,
                normalized,
                text_hash,
                simhash,
                cluster_id,
                priority,
                tier,
                "ingested",
                _now_iso(),
            ),
        )
        item_id = cur.lastrowid
        self.conn.commit()
        return LedgerItem(item_id=item_id, cluster_id=cluster_id, duplicate=duplicate)

    def get_cluster(self, cluster_id: str) -> Optional[sqlite3.Row]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM clusters WHERE cluster_id = ?", (cluster_id,))
        return cur.fetchone()

    def mark_draft(self, item_id: int, cluster_id: str, draft_text: str):
        draft_hash = self._text_hash(draft_text)
        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE items SET status = ?, draft_text = ?, draft_hash = ? WHERE id = ?
            """,
            ("drafted", draft_text, draft_hash, item_id),
        )
        cur.execute(
            """
            UPDATE clusters SET last_draft_at = ? WHERE cluster_id = ?
            """,
            (_now_iso(), cluster_id),
        )
        self.conn.commit()

    def mark_status(self, item_id: int, status: str):
        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE items SET status = ? WHERE id = ?
            """,
            (status, item_id),
        )
        self.conn.commit()

    def mark_published(self, item_id: int, cluster_id: str, tweet_id: str):
        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE items SET status = ?, tweet_id = ? WHERE id = ?
            """,
            ("published", tweet_id, item_id),
        )
        cur.execute(
            """
            UPDATE clusters SET last_published_at = ? WHERE cluster_id = ?
            """,
            (_now_iso(), cluster_id),
        )
        self.conn.commit()

    def archive_stale_items(self, days: int = 30) -> int:
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE items
            SET status = 'archived'
            WHERE status NOT IN ('published') AND created_at < ?
            """,
            (cutoff,),
        )
        self.conn.commit()
        return cur.rowcount

    def purge_old_clusters(self, days: int = 90) -> int:
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        cur = self.conn.cursor()
        cur.execute(
            """
            DELETE FROM clusters
            WHERE last_seen < ? AND cluster_id NOT IN (
                SELECT DISTINCT cluster_id FROM items WHERE status = 'published'
            )
            """,
            (cutoff,),
        )
        self.conn.commit()
        return cur.rowcount

    def recent_draft_similar(self, draft_text: str, lookback_days: int = 7, threshold: int = 6) -> bool:
        if not draft_text:
            return False
        draft_hash = self._text_hash(draft_text)
        simhash = compute_simhash(draft_text)
        cutoff = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT draft_hash, draft_text FROM items
            WHERE draft_text IS NOT NULL AND created_at >= ?
            """,
            (cutoff,),
        )
        for row in cur.fetchall():
            if row["draft_hash"] == draft_hash:
                return True
            candidate = row["draft_text"] or ""
            if not candidate:
                continue
            if hamming_distance(simhash, compute_simhash(candidate)) <= threshold:
                return True
        return False

    def drafts_today(self) -> int:
        start = datetime.utcnow().date().isoformat()
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) AS count FROM items
            WHERE status = 'drafted' AND created_at >= ?
            """,
            (start,),
        )
        row = cur.fetchone()
        return int(row["count"] if row else 0)
