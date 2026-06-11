from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
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
    archived: bool = Query(default=False),
):
    """Return the current user's query history. archived=false returns active, archived=true returns archived."""
    user_id = user["user_id"]
    archived_flag = 1 if archived else 0
    try:
        with get_conn() as conn:
            base_where = "session_id LIKE ? AND COALESCE(archived, 0) = ?"
            base_params: list = [f"{user_id}:%", archived_flag]
            if search:
                pattern = f"%{search}%"
                where = f"{base_where} AND (query LIKE ? OR answer LIKE ?)"
                params = base_params + [pattern, pattern]
            else:
                where = base_where
                params = base_params

            rows = conn.execute(
                f"""SELECT id, session_id, query, answer, timestamp, archived, archived_at
                    FROM conversation_history WHERE {where}
                    ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
                params + [limit, offset],
            ).fetchall()
            total = conn.execute(
                f"SELECT COUNT(*) FROM conversation_history WHERE {where}",
                params,
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
                    "archived": bool(r[5]),
                    "archived_at": r[6],
                }
                for r in rows
            ],
        }
    except Exception:
        return {"total": 0, "queries": []}


class ArchiveRequest(BaseModel):
    before_days: int = 30   # archive entries older than this many days


@router.post("/queries/archive")
async def archive_queries(
    body: ArchiveRequest,
    user: dict = Depends(get_current_user_or_api_key),
):
    """Archive all queries older than before_days days for this user."""
    from datetime import datetime, timedelta
    cutoff = (datetime.utcnow() - timedelta(days=body.before_days)).strftime("%Y-%m-%d %H:%M:%S")
    user_id = user["user_id"]
    try:
        with get_conn() as conn:
            cur = conn.execute(
                """UPDATE conversation_history
                   SET archived = 1, archived_at = CURRENT_TIMESTAMP
                   WHERE session_id LIKE ? AND COALESCE(archived, 0) = 0 AND timestamp < ?""",
                (f"{user_id}:%", cutoff),
            )
            conn.commit()
            archived_count = cur.rowcount
        return {"archived": archived_count, "before_days": body.before_days, "cutoff": cutoff}
    except Exception as e:
        return {"archived": 0, "error": str(e)}


@router.post("/queries/unarchive")
async def unarchive_queries(
    user: dict = Depends(get_current_user_or_api_key),
):
    """Restore all archived queries for this user."""
    user_id = user["user_id"]
    try:
        with get_conn() as conn:
            cur = conn.execute(
                "UPDATE conversation_history SET archived = 0, archived_at = NULL WHERE session_id LIKE ? AND archived = 1",
                (f"{user_id}:%",),
            )
            conn.commit()
        return {"restored": cur.rowcount}
    except Exception as e:
        return {"restored": 0, "error": str(e)}


@router.get("/queries/archive-stats")
async def archive_stats(
    user: dict = Depends(get_current_user_or_api_key),
    before_days: int = Query(default=30),
):
    """Count how many active queries are older than before_days (preview before archiving)."""
    from datetime import datetime, timedelta
    cutoff = (datetime.utcnow() - timedelta(days=before_days)).strftime("%Y-%m-%d %H:%M:%S")
    user_id = user["user_id"]
    try:
        with get_conn() as conn:
            eligible = conn.execute(
                "SELECT COUNT(*) FROM conversation_history WHERE session_id LIKE ? AND COALESCE(archived,0)=0 AND timestamp < ?",
                (f"{user_id}:%", cutoff),
            ).fetchone()[0]
            already_archived = conn.execute(
                "SELECT COUNT(*) FROM conversation_history WHERE session_id LIKE ? AND archived = 1",
                (f"{user_id}:%",),
            ).fetchone()[0]
        return {"eligible": eligible, "already_archived": already_archived, "before_days": before_days, "cutoff": cutoff}
    except Exception:
        return {"eligible": 0, "already_archived": 0}
