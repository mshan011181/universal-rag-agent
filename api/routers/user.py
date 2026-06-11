from fastapi import APIRouter, Depends, Query
from api.auth_utils import get_current_user_or_api_key
from src.memory.sqlite_store import get_conn

router = APIRouter()


@router.get("/stats")
async def get_user_stats(user: dict = Depends(get_current_user_or_api_key)):
    user_id = user["user_id"]
    try:
        with get_conn() as conn:
            query_count = conn.execute(
                "SELECT COUNT(*) FROM conversation_history WHERE session_id LIKE ?",
                (f"{user_id}:%",)
            ).fetchone()[0]

            avg_quality = conn.execute(
                "SELECT AVG(quality_score) FROM pattern_performance"
            ).fetchone()[0]

            doc_count = conn.execute(
                "SELECT COUNT(*) FROM ingest_history WHERE user_id = ? AND status = 'done' AND chunks_created > 0",
                (user_id,)
            ).fetchone()[0]

            quota_row = conn.execute(
                "SELECT storage_quota_bytes, COALESCE(SUM(i.file_size_bytes),0) "
                "FROM users u LEFT JOIN ingest_history i ON u.user_id = i.user_id AND i.status='done' "
                "WHERE u.user_id = ?",
                (user_id,)
            ).fetchone()
            quota = quota_row[0] if quota_row else 524288000
            storage_used = quota_row[1] if quota_row else 0

    except Exception:
        query_count = 0
        avg_quality = 0.0
        doc_count = 0
        quota = 524288000
        storage_used = 0

    return {
        "total_queries": query_count,
        "total_documents": doc_count,
        "avg_quality_score": round(avg_quality or 0.0, 3),
        "storage_used_bytes": storage_used,
        "storage_quota_bytes": quota,
    }


@router.get("/queries")
async def get_user_queries(
    user: dict = Depends(get_current_user_or_api_key),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    search: str = Query(default=""),
):
    """Return the current user's query history."""
    user_id = user["user_id"]
    try:
        with get_conn() as conn:
            if search:
                pattern = f"%{search}%"
                rows = conn.execute(
                    """SELECT id, session_id, query, answer, timestamp
                       FROM conversation_history
                       WHERE session_id LIKE ? AND (query LIKE ? OR answer LIKE ?)
                       ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
                    (f"{user_id}:%", pattern, pattern, limit, offset),
                ).fetchall()
                total = conn.execute(
                    "SELECT COUNT(*) FROM conversation_history WHERE session_id LIKE ? AND (query LIKE ? OR answer LIKE ?)",
                    (f"{user_id}:%", pattern, pattern),
                ).fetchone()[0]
            else:
                rows = conn.execute(
                    """SELECT id, session_id, query, answer, timestamp
                       FROM conversation_history
                       WHERE session_id LIKE ?
                       ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
                    (f"{user_id}:%", limit, offset),
                ).fetchall()
                total = conn.execute(
                    "SELECT COUNT(*) FROM conversation_history WHERE session_id LIKE ?",
                    (f"{user_id}:%",),
                ).fetchone()[0]
        return {
            "total": total,
            "queries": [
                {
                    "id": r[0],
                    "session_id": r[1].split(":", 1)[1] if ":" in r[1] else r[1],
                    "query": r[2],
                    "answer": r[3],
                    "timestamp": r[4],
                }
                for r in rows
            ],
        }
    except Exception:
        return {"total": 0, "queries": []}
