from fastapi import APIRouter, Depends
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
