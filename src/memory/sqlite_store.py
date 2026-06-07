import sqlite3
import json
from datetime import datetime
from pathlib import Path
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
            status TEXT DEFAULT 'done'
        );
        """)


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
    with get_conn() as conn:
        row = conn.execute(
            "SELECT answer FROM verified_knowledge WHERE query_fingerprint=? AND quality_score >= 0.85",
            (fingerprint,)
        ).fetchone()
    return row["answer"] if row else None


def write_verified_knowledge(fingerprint: str, answer: str, quality: float, chunk_ids: list):
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id, confirmed_count FROM verified_knowledge WHERE query_fingerprint=?", (fingerprint,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE verified_knowledge SET confirmed_count=?, quality_score=? WHERE id=?",
                (existing["confirmed_count"] + 1, quality, existing["id"])
            )
        else:
            conn.execute(
                "INSERT INTO verified_knowledge (query_fingerprint, answer, quality_score, chunk_ids) VALUES (?,?,?,?)",
                (fingerprint, answer, quality, json.dumps(chunk_ids))
            )


def write_ingest(ingest_id: str, user_id: str, ingest_type: str, source_name: str, source_url: str | None = None, file_size: int | None = None, chunks: int = 0):
    """Log an ingest operation to history."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO ingest_history (ingest_id, user_id, ingest_type, source_name, source_url, file_size_bytes, chunks_created)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (ingest_id, user_id, ingest_type, source_name, source_url, file_size, chunks)
        )
        conn.commit()


def get_ingest_history(user_id: str) -> list[dict]:
    """Get all ingestion history for a user."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT ingest_id, ingest_type, source_name, source_url, file_size_bytes, chunks_created, created_at, status FROM ingest_history WHERE user_id=? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_ingest(ingest_id: str, user_id: str) -> bool:
    """Delete an ingest record (soft delete by updating status)."""
    with get_conn() as conn:
        result = conn.execute(
            "DELETE FROM ingest_history WHERE ingest_id=? AND user_id=?",
            (ingest_id, user_id)
        )
        conn.commit()
    return result.rowcount > 0
