"""
pg_store.py — PostgreSQL backend, drop-in replacement for sqlite_store.py.

Drop-in compatibility strategy:
- PgConn wraps a psycopg2 connection with a sqlite3-compatible API
  (conn.execute(), executescript(), context manager commit/rollback)
- PgRow supports both dict-style row["col"] AND index-style row[i] access
- PRAGMA table_info(X) is automatically translated to information_schema
- ? placeholders are rewritten to %s for psycopg2

Activated automatically when DATABASE_URL starts with postgresql:// or postgres://
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import re
import threading
from typing import Any

import psycopg2
import psycopg2.pool

logger = logging.getLogger(__name__)

_DATABASE_URL = os.getenv("DATABASE_URL", "")

# Thread-safe connection pool — lazily initialised on first use
_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2,
                    maxconn=20,
                    dsn=_DATABASE_URL,
                )
    return _pool


# ── Compatibility layer ───────────────────────────────────────────────────────

class PgRow:
    """sqlite3.Row-compatible row that supports dict-style and index-style access."""

    __slots__ = ("_data", "_keys", "_map")

    def __init__(self, row_tuple: tuple, description: list) -> None:
        self._data = row_tuple
        self._keys = [d[0] for d in description]
        self._map = dict(zip(self._keys, row_tuple))

    def __getitem__(self, key: int | str) -> Any:
        if isinstance(key, int):
            return self._data[key]
        return self._map[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self._map.get(key, default)

    def keys(self) -> list[str]:
        return self._keys

    def __iter__(self):
        return iter(self._data)

    def __repr__(self) -> str:  # pragma: no cover
        return f"PgRow({self._map})"


class PgCursor:
    """Wraps a psycopg2 cursor and returns PgRow objects from fetchone/fetchall."""

    def __init__(self, cur) -> None:
        self._cur = cur

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    def fetchone(self) -> PgRow | None:
        row = self._cur.fetchone()
        if row is None:
            return None
        return PgRow(row, self._cur.description or [])

    def fetchall(self) -> list[PgRow]:
        rows = self._cur.fetchall()
        desc = self._cur.description or []
        return [PgRow(r, desc) for r in rows]

    def __iter__(self):
        desc = self._cur.description or []
        for row in self._cur:
            yield PgRow(row, desc)


_PRAGMA_RE = re.compile(r"^\s*PRAGMA\s+table_info\((\w+)\)\s*$", re.IGNORECASE)
_SQLITE_DATETIME = re.compile(r"datetime\('now',\s*'([^']+)'\)", re.IGNORECASE)
_SQLITE_AUTOINC = re.compile(r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT", re.IGNORECASE)


def _translate(sql: str) -> str:
    """Translate SQLite-specific SQL to PostgreSQL."""
    # ? → %s
    sql = sql.replace("?", "%s")
    # INTEGER PRIMARY KEY AUTOINCREMENT → BIGSERIAL PRIMARY KEY
    sql = _SQLITE_AUTOINC.sub("BIGSERIAL PRIMARY KEY", sql)
    # datetime('now', '-30 days') → NOW() - INTERVAL '30 days'
    def _dt(m: re.Match) -> str:
        val = m.group(1).strip()          # e.g. "-30 days"  or  "-30 || ' days'"
        # strip the concat artifact if coming from purge_audit_logs
        val = val.replace("|| ' days'", "days").strip("' ")
        return f"NOW() - INTERVAL '{val}'"
    sql = _SQLITE_DATETIME.sub(_dt, sql)
    # CURRENT_TIMESTAMP → NOW()  (both are fine in PG, but stay consistent)
    return sql


class PgConn:
    """sqlite3-connection-compatible wrapper around a psycopg2 connection."""

    def __init__(self, raw_conn) -> None:
        self._conn = raw_conn
        self._conn.autocommit = False

    # ── sqlite3 Connection API ────────────────────────────────────────────────

    def execute(self, sql: str, params: tuple | list | None = None) -> PgCursor:
        pragma_m = _PRAGMA_RE.match(sql.strip())
        if pragma_m:
            table = pragma_m.group(1)
            sql = (
                "SELECT ordinal_position AS cid, column_name AS name, "
                "data_type AS type, 0 AS notnull, column_default AS dflt_value, 0 AS pk "
                "FROM information_schema.columns WHERE table_name = %s "
                "ORDER BY ordinal_position"
            )
            params = (table,)
        else:
            sql = _translate(sql)

        cur = self._conn.cursor()
        cur.execute(sql, params or ())
        return PgCursor(cur)

    def executescript(self, sql: str) -> PgCursor:
        """Execute a multi-statement SQL script (DDL)."""
        cur = self._conn.cursor()
        cur.execute(_translate(sql))
        return PgCursor(cur)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self) -> "PgConn":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if exc_type:
            self._conn.rollback()
        else:
            self._conn.commit()
        _get_pool().putconn(self._conn)
        return False


def get_conn() -> PgConn:
    """Return a sqlite3-compatible PgConn context manager backed by the connection pool."""
    raw = _get_pool().getconn()
    return PgConn(raw)


# ── Schema initialisation ─────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables (idempotent — uses IF NOT EXISTS / IF NOT EXISTS column)."""
    ddl = """
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT '',
        role TEXT DEFAULT 'user',
        storage_quota_bytes BIGINT DEFAULT 524288000,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS organisations (
        org_id TEXT PRIMARY KEY,
        org_name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        plan TEXT DEFAULT 'free',
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS org_invites (
        id BIGSERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        org_id TEXT NOT NULL,
        invited_email TEXT NOT NULL,
        invited_by TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS email_otps (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        purpose TEXT NOT NULL,
        token TEXT,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conversation_history (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        query TEXT,
        rewritten_query TEXT,
        answer TEXT,
        timestamp TIMESTAMP DEFAULT NOW(),
        archived INTEGER DEFAULT 0,
        archived_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_conv_session ON conversation_history(session_id);

    CREATE TABLE IF NOT EXISTS pattern_performance (
        id BIGSERIAL PRIMARY KEY,
        pattern_combo TEXT,
        query_class TEXT,
        quality_score REAL,
        latency_ms INTEGER,
        retry_count INTEGER,
        success_rate REAL DEFAULT 1.0,
        run_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS routing_signals (
        query_fingerprint TEXT PRIMARY KEY,
        detected_class TEXT,
        recommended_combo TEXT,
        confidence_score REAL,
        last_updated TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS verified_knowledge (
        id BIGSERIAL PRIMARY KEY,
        query_fingerprint TEXT,
        answer TEXT,
        quality_score REAL,
        chunk_ids TEXT,
        confirmed_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ingest_history (
        ingest_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ingest_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_url TEXT,
        file_size_bytes BIGINT,
        chunks_created INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        status TEXT DEFAULT 'done',
        progress INTEGER DEFAULT 0,
        progress_label TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        user_id TEXT,
        email TEXT,
        org_id TEXT,
        detail TEXT,
        ip_address TEXT,
        status TEXT DEFAULT 'success',
        created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id);
    CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_type);

    CREATE TABLE IF NOT EXISTS retention_policy (
        org_id TEXT PRIMARY KEY,
        audit_log_days INTEGER DEFAULT 90,
        conversation_days INTEGER DEFAULT 90,
        updated_at TIMESTAMP DEFAULT NOW()
    );

    -- ── LMS tables ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS course_materials (
        id BIGSERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        grade TEXT NOT NULL,
        subject TEXT NOT NULL,
        source_name TEXT NOT NULL,
        ingest_id TEXT,
        uploaded_by TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cm_org_grade ON course_materials(org_id, grade, subject);

    CREATE TABLE IF NOT EXISTS teacher_subjects (
        id BIGSERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        teacher_id TEXT NOT NULL,
        grade TEXT NOT NULL,
        subject TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ts_teacher ON teacher_subjects(teacher_id);

    CREATE TABLE IF NOT EXISTS parent_children (
        id BIGSERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pc_parent ON parent_children(parent_id);

    CREATE TABLE IF NOT EXISTS assignments (
        id BIGSERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        teacher_id TEXT NOT NULL,
        grade TEXT NOT NULL,
        subject TEXT NOT NULL,
        title TEXT NOT NULL,
        instructions TEXT DEFAULT '',
        questions_json TEXT DEFAULT '[]',
        rubric TEXT DEFAULT '',
        model TEXT DEFAULT '',
        due_date TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_asg_org_grade ON assignments(org_id, grade, subject);

    CREATE TABLE IF NOT EXISTS submissions (
        id BIGSERIAL PRIMARY KEY,
        assignment_id BIGINT NOT NULL,
        student_id TEXT NOT NULL,
        answers_json TEXT DEFAULT '[]',
        score INTEGER DEFAULT 0,
        results_json TEXT DEFAULT '[]',
        gap_analysis TEXT DEFAULT '',
        status TEXT DEFAULT 'submitted',
        submitted_at TIMESTAMP DEFAULT NOW(),
        graded_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sub_assignment ON submissions(assignment_id);
    CREATE INDEX IF NOT EXISTS idx_sub_student ON submissions(student_id);

    -- Parent-owned student profiles (TutorBottle-style /edu experience).
    CREATE TABLE IF NOT EXISTS student_profiles (
        id BIGSERIAL PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT '',
        parent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        grade TEXT NOT NULL,
        pin TEXT DEFAULT '',
        teaching_style TEXT DEFAULT '',
        plan TEXT DEFAULT 'trial',
        valid_till TEXT DEFAULT '',
        study_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sp_parent ON student_profiles(parent_id);
    """
    with get_conn() as conn:
        conn.executescript(ddl)
        # Add LMS columns to the existing users table (idempotent).
        for col, definition in [("full_name", "TEXT DEFAULT ''"), ("grade", "TEXT DEFAULT ''"),
                                ("parent_pin", "TEXT DEFAULT ''")]:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {definition}")
                conn.commit()
            except Exception:
                conn.rollback()
    logger.info("PostgreSQL schema initialised")


# ── High-level functions (same signatures as sqlite_store.py) ─────────────────

def get_history(session_id: str, last_n: int = 5) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT turn, query, answer FROM conversation_history "
            "WHERE session_id=? ORDER BY turn DESC LIMIT ?",
            (session_id, last_n),
        ).fetchall()
    return [dict(r._map) for r in reversed(rows)]


def write_turn(session_id: str, turn: int, query: str, rewritten: str, answer: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO conversation_history (session_id, turn, query, rewritten_query, answer) "
            "VALUES (?,?,?,?,?)",
            (session_id, turn, query, rewritten, answer),
        )


def write_performance(
    pattern_combo: str, query_class: str, quality: float, latency: int, retries: int
) -> None:
    combo_str = "+".join(pattern_combo) if isinstance(pattern_combo, list) else pattern_combo
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pattern_performance "
            "(pattern_combo, query_class, quality_score, latency_ms, retry_count) VALUES (?,?,?,?,?)",
            (combo_str, query_class, quality, latency, retries),
        )


def get_best_combo(query_class: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT pattern_combo FROM pattern_performance "
            "WHERE query_class=? AND run_count > 5 "
            "GROUP BY pattern_combo ORDER BY AVG(quality_score) DESC LIMIT 1",
            (query_class,),
        ).fetchone()
    return row["pattern_combo"] if row else None


def check_verified_knowledge(fingerprint: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT answer FROM verified_knowledge WHERE query_fingerprint=? AND quality_score >= 0.85",
            (fingerprint,),
        ).fetchone()
    return row["answer"] if row else None


def write_verified_knowledge(
    fingerprint: str, answer: str, quality: float, chunk_ids: list
) -> None:
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id, confirmed_count, quality_score FROM verified_knowledge WHERE query_fingerprint=?",
            (fingerprint,),
        ).fetchone()
        if existing:
            if quality > existing["quality_score"]:
                conn.execute(
                    "UPDATE verified_knowledge SET answer=?, quality_score=?, chunk_ids=?, confirmed_count=? WHERE id=?",
                    (answer, quality, json.dumps(chunk_ids), existing["confirmed_count"] + 1, existing["id"]),
                )
            else:
                conn.execute(
                    "UPDATE verified_knowledge SET confirmed_count=? WHERE id=?",
                    (existing["confirmed_count"] + 1, existing["id"]),
                )
        else:
            conn.execute(
                "INSERT INTO verified_knowledge (query_fingerprint, answer, quality_score, chunk_ids) VALUES (?,?,?,?)",
                (fingerprint, answer, quality, json.dumps(chunk_ids)),
            )


def purge_stale_cache(min_quality: float = 0.85) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM verified_knowledge WHERE quality_score < ?", (min_quality,)
        )
    return cur.rowcount


def write_ingest(
    ingest_id: str,
    user_id: str,
    ingest_type: str,
    source_name: str,
    source_url: str | None = None,
    file_size: int | None = None,
    chunks: int = 0,
    status: str = "processing",
) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO ingest_history "
            "(ingest_id, user_id, ingest_type, source_name, source_url, file_size_bytes, chunks_created, status) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (ingest_id, user_id, ingest_type, source_name, source_url, file_size, chunks, status),
        )


def set_ingest_progress(ingest_id: str, progress: int, label: str = "") -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE ingest_history SET progress=?, progress_label=? WHERE ingest_id=?",
            (max(0, min(100, progress)), label, ingest_id),
        )


def get_ingest_history(user_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT ingest_id, ingest_type, source_name, source_url, file_size_bytes, "
            "chunks_created, created_at, status, progress, progress_label "
            "FROM ingest_history WHERE user_id=? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(r._map) for r in rows]


def get_recent_docs(user_id: str, n: int = 2) -> list[dict]:
    _SPREADSHEET_EXTS = (".xlsx", ".xls", ".csv")
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT source_name, ingest_type FROM ingest_history "
            "WHERE user_id=? AND status='done' AND ingest_type IN ('document', 'weblinks', 'weblink') "
            "ORDER BY created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()
    results = [
        dict(r._map) for r in rows
        if not any(r["source_name"].lower().endswith(ext) for ext in _SPREADSHEET_EXTS)
    ]
    return results[:n]


def get_spreadsheet_files(user_id: str) -> list[dict]:
    _SPREADSHEET_EXTS = (".xlsx", ".xls", ".csv")
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT source_name, source_url, user_id FROM ingest_history "
            "WHERE user_id=? AND status='done' AND ingest_type='document' ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [
        dict(r._map) for r in rows
        if any(r["source_name"].lower().endswith(ext) for ext in _SPREADSHEET_EXTS)
    ]


def delete_ingest(ingest_id: str, user_id: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT source_name FROM ingest_history WHERE ingest_id=? AND user_id=?",
            (ingest_id, user_id),
        ).fetchone()
        if not row:
            return None
        source_name = row["source_name"]
        conn.execute(
            "DELETE FROM ingest_history WHERE ingest_id=? AND user_id=?",
            (ingest_id, user_id),
        )
    return source_name


def write_audit(
    event_type: str,
    user_id: str | None = None,
    email: str | None = None,
    org_id: str | None = None,
    detail: dict | None = None,
    ip_address: str | None = None,
    status: str = "success",
) -> None:
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO audit_log (event_type, user_id, email, org_id, detail, ip_address, status) "
                "VALUES (?,?,?,?,?,?,?)",
                (event_type, user_id, email, org_id,
                 json.dumps(detail) if detail else None, ip_address, status),
            )
    except Exception:
        pass  # audit must never break the main request


def get_audit_logs(
    org_id: str,
    event_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
    since: str | None = None,
) -> list[dict]:
    query = "SELECT * FROM audit_log WHERE org_id=?"
    params: list = [org_id]
    if event_type:
        query += " AND event_type=?"
        params.append(event_type)
    if since:
        query += " AND created_at >= ?"
        params.append(since)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params += [limit, offset]
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r._map) for r in rows]


def get_retention_policy(org_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT audit_log_days, conversation_days, updated_at FROM retention_policy WHERE org_id=?",
            (org_id,),
        ).fetchone()
    if row:
        return dict(row._map)
    return {"audit_log_days": 90, "conversation_days": 90, "updated_at": None}


def set_retention_policy(org_id: str, audit_log_days: int, conversation_days: int) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO retention_policy (org_id, audit_log_days, conversation_days, updated_at) "
            "VALUES (?,?,?, NOW()) "
            "ON CONFLICT(org_id) DO UPDATE SET "
            "audit_log_days=EXCLUDED.audit_log_days, "
            "conversation_days=EXCLUDED.conversation_days, "
            "updated_at=NOW()",
            (org_id, audit_log_days, conversation_days),
        )


def purge_audit_logs(org_id: str, older_than_days: int) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM audit_log WHERE org_id=? AND created_at < NOW() - INTERVAL '%s days'",
            (org_id, older_than_days),
        )
    return cur.rowcount


def export_audit_logs_csv(
    org_id: str,
    event_type: str | None = None,
    since: str | None = None,
) -> str:
    query = (
        "SELECT id, event_type, user_id, email, org_id, detail, ip_address, status, created_at "
        "FROM audit_log WHERE org_id=?"
    )
    params: list = [org_id]
    if event_type:
        query += " AND event_type=?"
        params.append(event_type)
    if since:
        query += " AND created_at >= ?"
        params.append(since)
    query += " ORDER BY created_at DESC"
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "event_type", "user_id", "email", "org_id", "detail", "ip_address", "status", "created_at"])
    for r in rows:
        writer.writerow([r["id"], r["event_type"], r["user_id"], r["email"], r["org_id"],
                         r["detail"], r["ip_address"], r["status"], r["created_at"]])
    return buf.getvalue()


def erase_user_data(target_user_id: str, org_id: str) -> dict:
    deleted: dict[str, int] = {}
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM audit_log WHERE user_id=? AND org_id=?", (target_user_id, org_id))
        deleted["audit_log"] = cur.rowcount
        cur = conn.execute("DELETE FROM conversation_history WHERE session_id LIKE ?", (f"{target_user_id}%",))
        deleted["conversation_history"] = cur.rowcount
        cur = conn.execute("DELETE FROM ingest_history WHERE user_id=?", (target_user_id,))
        deleted["ingest_history"] = cur.rowcount
        deleted["pattern_performance"] = 0
        cur = conn.execute("DELETE FROM users WHERE user_id=? AND org_id=?", (target_user_id, org_id))
        deleted["users"] = cur.rowcount
    return deleted


def delete_cache_by_source(source_name: str) -> int:
    deleted = 0
    with get_conn() as conn:
        rows = conn.execute("SELECT id, chunk_ids FROM verified_knowledge").fetchall()
        for r in rows:
            try:
                ids = json.loads(r["chunk_ids"] or "[]")
                if any(source_name in str(cid) for cid in ids):
                    conn.execute("DELETE FROM verified_knowledge WHERE id=?", (r["id"],))
                    deleted += 1
            except Exception:
                pass
    return deleted
