import sqlite3
import json
from src.config import DB_PATH


def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            turn INTEGER NOT NULL,
            query TEXT,
            rewritten_query TEXT,
            answer TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS pattern_performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern_combo TEXT,
            query_class TEXT,
            quality_score REAL,
            latency_ms INTEGER,
            retry_count INTEGER,
            success_rate REAL DEFAULT 1.0,
            run_count INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS routing_signals (
            query_fingerprint TEXT PRIMARY KEY,
            detected_class TEXT,
            recommended_combo TEXT,
            confidence_score REAL,
            last_updated TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS verified_knowledge (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_fingerprint TEXT,
            answer TEXT,
            quality_score REAL,
            chunk_ids TEXT,
            confirmed_count INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ingest_history (
            ingest_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            ingest_type TEXT NOT NULL,
            source_name TEXT NOT NULL,
            source_url TEXT,
            file_size_bytes INTEGER,
            chunks_created INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'done',
            progress INTEGER DEFAULT 0,
            progress_label TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type  TEXT NOT NULL,
            user_id     TEXT,
            email       TEXT,
            org_id      TEXT,
            detail      TEXT,
            ip_address  TEXT,
            status      TEXT DEFAULT 'success',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS organisations (
            org_id   TEXT PRIMARY KEY,
            org_name TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            plan     TEXT DEFAULT 'free',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS org_invites (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            token       TEXT NOT NULL UNIQUE,
            org_id      TEXT NOT NULL,
            invited_email TEXT NOT NULL,
            invited_by  TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            used        INTEGER DEFAULT 0,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS retention_policy (
            org_id              TEXT PRIMARY KEY,
            audit_log_days      INTEGER DEFAULT 90,
            conversation_days   INTEGER DEFAULT 90,
            updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS course_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id TEXT NOT NULL,
            grade TEXT NOT NULL,
            subject TEXT NOT NULL,
            source_name TEXT NOT NULL,
            ingest_id TEXT,
            uploaded_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS teacher_subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id TEXT NOT NULL,
            teacher_id TEXT NOT NULL,
            grade TEXT NOT NULL,
            subject TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS parent_children (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id TEXT NOT NULL,
            parent_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER NOT NULL,
            student_id TEXT NOT NULL,
            answers_json TEXT DEFAULT '[]',
            score INTEGER DEFAULT 0,
            results_json TEXT DEFAULT '[]',
            gap_analysis TEXT DEFAULT '',
            status TEXT DEFAULT 'submitted',
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            graded_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS student_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id TEXT NOT NULL DEFAULT '',
            parent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            grade TEXT NOT NULL,
            pin TEXT DEFAULT '',
            teaching_style TEXT DEFAULT '',
            plan TEXT DEFAULT 'trial',
            valid_till TEXT DEFAULT '',
            study_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
    # Schema migrations — safe to run on existing databases
    with get_conn() as conn:
        for table, col, definition in [
            ("ingest_history",       "progress",       "INTEGER DEFAULT 0"),
            ("ingest_history",       "progress_label", "TEXT DEFAULT ''"),
            ("conversation_history", "archived",       "INTEGER DEFAULT 0"),
            ("conversation_history", "archived_at",    "TIMESTAMP"),
        ]:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
                conn.commit()
            except Exception:
                pass  # column already exists


def get_history(session_id: str, last_n: int = 5) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT turn, query, answer FROM conversation_history "
            "WHERE session_id=? ORDER BY turn DESC LIMIT ?",
            (session_id, last_n)
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


def write_turn(session_id: str, turn: int, query: str, rewritten: str, answer: str):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO conversation_history (session_id, turn, query, rewritten_query, answer) VALUES (?,?,?,?,?)",
            (session_id, turn, query, rewritten, answer)
        )


def write_performance(pattern_combo: str, query_class: str, quality: float, latency: int, retries: int):
    combo_str = "+".join(pattern_combo) if isinstance(pattern_combo, list) else pattern_combo
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pattern_performance (pattern_combo, query_class, quality_score, latency_ms, retry_count) VALUES (?,?,?,?,?)",
            (combo_str, query_class, quality, latency, retries)
        )


def get_best_combo(query_class: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT pattern_combo FROM pattern_performance "
            "WHERE query_class=? AND run_count > 5 "
            "GROUP BY pattern_combo ORDER BY AVG(quality_score) DESC LIMIT 1",
            (query_class,)
        ).fetchone()
    return row["pattern_combo"] if row else None


def check_verified_knowledge(fingerprint: str) -> str | None:
    """Return a cached answer only if quality >= 0.85. Returns None on miss."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT answer FROM verified_knowledge WHERE query_fingerprint=? AND quality_score >= 0.85",
            (fingerprint,)
        ).fetchone()
    return row["answer"] if row else None


def write_verified_knowledge(fingerprint: str, answer: str, quality: float, chunk_ids: list):
    """Write or upgrade a verified_knowledge entry.

    Rules:
    - If no entry exists → insert.
    - If an entry exists with LOWER quality → overwrite answer + quality.
    - If an entry exists with EQUAL OR HIGHER quality → only bump confirmed_count.
    This prevents a repeat bad retrieval from downgrading a previously good answer.
    """
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id, confirmed_count, quality_score FROM verified_knowledge WHERE query_fingerprint=?",
            (fingerprint,)
        ).fetchone()
        if existing:
            if quality > existing["quality_score"]:
                # Better answer found — replace content and quality
                conn.execute(
                    "UPDATE verified_knowledge SET answer=?, quality_score=?, chunk_ids=?, confirmed_count=? WHERE id=?",
                    (answer, quality, json.dumps(chunk_ids), existing["confirmed_count"] + 1, existing["id"])
                )
            else:
                # Same or worse — just note it was seen again
                conn.execute(
                    "UPDATE verified_knowledge SET confirmed_count=? WHERE id=?",
                    (existing["confirmed_count"] + 1, existing["id"])
                )
        else:
            conn.execute(
                "INSERT INTO verified_knowledge (query_fingerprint, answer, quality_score, chunk_ids) VALUES (?,?,?,?)",
                (fingerprint, answer, quality, json.dumps(chunk_ids))
            )


def purge_stale_cache(min_quality: float = 0.85) -> int:
    """Delete all verified_knowledge entries whose quality is below min_quality.

    Called automatically on every query so stale/wrong answers cannot
    accumulate and be served later.  The DELETE is a single indexed scan
    (quality_score column) and completes in microseconds.

    Returns the number of entries removed.
    """
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM verified_knowledge WHERE quality_score < ?",
            (min_quality,)
        )
        conn.commit()
        return cur.rowcount


def write_ingest(ingest_id: str, user_id: str, ingest_type: str, source_name: str, source_url: str | None = None, file_size: int | None = None, chunks: int = 0, status: str = 'processing'):
    """Log an ingest operation to history."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO ingest_history (ingest_id, user_id, ingest_type, source_name, source_url, file_size_bytes, chunks_created, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (ingest_id, user_id, ingest_type, source_name, source_url, file_size, chunks, status)
        )
        conn.commit()


def set_ingest_progress(ingest_id: str, progress: int, label: str = "") -> None:
    """Update progress (0–100) and label for an in-flight ingest job."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE ingest_history SET progress=?, progress_label=? WHERE ingest_id=?",
            (max(0, min(100, progress)), label, ingest_id),
        )
        conn.commit()


def get_ingest_history(user_id: str) -> list[dict]:
    """Get all ingestion history for a user."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT ingest_id, ingest_type, source_name, source_url, file_size_bytes,
                      chunks_created, created_at, status, progress, progress_label
               FROM ingest_history WHERE user_id=? ORDER BY created_at DESC""",
            (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_recent_docs(user_id: str, n: int = 2) -> list[dict]:
    """Return the N most recently ingested non-spreadsheet documents for a user.

    Used by CrossRag when no specific filenames are mentioned in the query.
    Excludes Excel/CSV files (those belong to BIRag).
    """
    _SPREADSHEET_EXTS = (".xlsx", ".xls", ".csv")
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT source_name, ingest_type
               FROM ingest_history
               WHERE user_id=? AND status='done'
               AND ingest_type IN ('document', 'weblinks', 'weblink')
               ORDER BY created_at DESC
               LIMIT 20""",
            (user_id,)
        ).fetchall()
    results = [
        dict(r) for r in rows
        if not any(r["source_name"].lower().endswith(ext) for ext in _SPREADSHEET_EXTS)
    ]
    return results[:n]


def get_spreadsheet_files(user_id: str) -> list[dict]:
    """Return all successfully ingested Excel/CSV files for a user, including file path."""
    _SPREADSHEET_EXTS = (".xlsx", ".xls", ".csv")
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT source_name, source_url, user_id
               FROM ingest_history
               WHERE user_id=? AND status='done' AND ingest_type='document'
               ORDER BY created_at DESC""",
            (user_id,)
        ).fetchall()
    return [
        dict(r) for r in rows
        if any(r["source_name"].lower().endswith(ext) for ext in _SPREADSHEET_EXTS)
    ]


def delete_ingest(ingest_id: str, user_id: str) -> str | None:
    """Delete an ingest record. Returns source_name on success, None if not found."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT source_name FROM ingest_history WHERE ingest_id=? AND user_id=?",
            (ingest_id, user_id)
        ).fetchone()
        if not row:
            return None
        source_name = row["source_name"]
        conn.execute(
            "DELETE FROM ingest_history WHERE ingest_id=? AND user_id=?",
            (ingest_id, user_id)
        )
        conn.commit()
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
    """Write one audit log entry. Non-blocking — failures are silently ignored."""
    try:
        with get_conn() as conn:
            conn.execute(
                """INSERT INTO audit_log
                   (event_type, user_id, email, org_id, detail, ip_address, status)
                   VALUES (?,?,?,?,?,?,?)""",
                (
                    event_type,
                    user_id,
                    email,
                    org_id,
                    json.dumps(detail) if detail else None,
                    ip_address,
                    status,
                ),
            )
            conn.commit()
    except Exception:
        pass  # audit must never break the main request


def get_audit_logs(
    org_id: str,
    event_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
    since: str | None = None,   # ISO datetime string
) -> list[dict]:
    """Return audit log entries for an org, newest first."""
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
    return [dict(r) for r in rows]


# ── Data Retention ───────────────────────────────────────────────────────────

def get_retention_policy(org_id: str) -> dict:
    """Return retention settings for an org. Defaults: 90 days for all."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT audit_log_days, conversation_days, updated_at FROM retention_policy WHERE org_id=?",
            (org_id,)
        ).fetchone()
    if row:
        return dict(row)
    return {"audit_log_days": 90, "conversation_days": 90, "updated_at": None}


def set_retention_policy(org_id: str, audit_log_days: int, conversation_days: int) -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO retention_policy (org_id, audit_log_days, conversation_days, updated_at)
               VALUES (?,?,?, CURRENT_TIMESTAMP)
               ON CONFLICT(org_id) DO UPDATE SET
                 audit_log_days=excluded.audit_log_days,
                 conversation_days=excluded.conversation_days,
                 updated_at=CURRENT_TIMESTAMP""",
            (org_id, audit_log_days, conversation_days)
        )
        conn.commit()


def purge_audit_logs(org_id: str, older_than_days: int) -> int:
    """Delete audit_log rows for an org older than N days. Returns count deleted."""
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM audit_log WHERE org_id=? AND created_at < datetime('now', ? || ' days')",
            (org_id, f"-{older_than_days}")
        )
        conn.commit()
    return cur.rowcount


def export_audit_logs_csv(
    org_id: str,
    event_type: str | None = None,
    since: str | None = None,
) -> str:
    """Return all audit log rows for the org as a CSV string (for download/backup)."""
    import csv
    import io
    query = "SELECT id, event_type, user_id, email, org_id, detail, ip_address, status, created_at FROM audit_log WHERE org_id=?"
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
    """
    GDPR Right to Erasure — permanently delete all data for a user.
    Removes: audit_log entries, conversation_history, ingest_history, user row.
    Returns counts of rows deleted per table.
    """
    deleted: dict[str, int] = {}
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM audit_log WHERE user_id=? AND org_id=?", (target_user_id, org_id))
        deleted["audit_log"] = cur.rowcount

        cur = conn.execute("DELETE FROM conversation_history WHERE session_id LIKE ?", (f"{target_user_id}%",))
        deleted["conversation_history"] = cur.rowcount

        cur = conn.execute("DELETE FROM ingest_history WHERE user_id=?", (target_user_id,))
        deleted["ingest_history"] = cur.rowcount

        cur = conn.execute("DELETE FROM pattern_performance WHERE 1=0")  # not user-scoped, skip
        deleted["pattern_performance"] = 0

        cur = conn.execute("DELETE FROM users WHERE user_id=? AND org_id=?", (target_user_id, org_id))
        deleted["users"] = cur.rowcount

        conn.commit()
    return deleted


def delete_cache_by_source(source_name: str) -> int:
    """Delete all verified_knowledge cache entries whose chunk_ids include source_name."""
    deleted = 0
    with get_conn() as conn:
        rows = conn.execute("SELECT id, chunk_ids FROM verified_knowledge").fetchall()
        ids_to_delete = []
        for row in rows:
            try:
                sources = json.loads(row["chunk_ids"]) if row["chunk_ids"] else []
            except Exception:
                sources = []
            if source_name in sources:
                ids_to_delete.append(row["id"])
        if ids_to_delete:
            conn.execute(
                f"DELETE FROM verified_knowledge WHERE id IN ({','.join('?' * len(ids_to_delete))})",  # nosec B608
                ids_to_delete
            )
            conn.commit()
            deleted = len(ids_to_delete)
    return deleted


# ── PostgreSQL override ───────────────────────────────────────────────────────
# When DATABASE_URL points to PostgreSQL, replace every function defined above
# with the psycopg2-backed equivalents from pg_store.  This block MUST be at
# the bottom so the imports win over the sqlite definitions above.
import os as _os
_DATABASE_URL = _os.getenv("DATABASE_URL", "")
if _DATABASE_URL.startswith("postgresql://") or _DATABASE_URL.startswith("postgres://"):
    from src.memory.pg_store import (  # noqa: F401
        get_conn, init_db,
        get_history, write_turn,
        write_performance, get_best_combo,
        check_verified_knowledge, write_verified_knowledge, purge_stale_cache,
        write_ingest, set_ingest_progress, get_ingest_history,
        get_recent_docs, get_spreadsheet_files, delete_ingest,
        write_audit, get_audit_logs,
        get_retention_policy, set_retention_policy,
        purge_audit_logs, export_audit_logs_csv, erase_user_data,
        delete_cache_by_source,
    )
