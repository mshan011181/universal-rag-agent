from fastapi import APIRouter, Depends
from api.auth_utils import require_role
from src.retrieval.vector_store import collection_count, list_sources
from src.memory.sqlite_store import get_conn

router = APIRouter()


@router.get("/stats")
async def get_stats(user: dict = Depends(require_role("admin"))):
    try:
        with get_conn() as conn:
            query_count = conn.execute("SELECT COUNT(*) FROM conversation_history").fetchone()[0]
            avg_quality = conn.execute("SELECT AVG(quality_score) FROM pattern_performance").fetchone()[0]
    except Exception:
        query_count = 0
        avg_quality = 0.0

    try:
        with get_conn() as conn:
            pattern_rows = conn.execute(
                "SELECT pattern_combo, COUNT(*) as cnt FROM pattern_performance GROUP BY pattern_combo"
            ).fetchall()
            pattern_breakdown = {row[0]: row[1] for row in pattern_rows}
    except Exception:
        pattern_breakdown = {}

    return {
        "total_queries": query_count,
        "total_users": 1,           # in-memory store — always 1 active user per session
        "total_documents": collection_count(),
        "avg_quality_score": round(avg_quality or 0.0, 3),
        "pattern_breakdown": pattern_breakdown,
    }


@router.get("/pattern-performance")
async def get_pattern_performance(user: dict = Depends(require_role("admin"))):
    try:
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT pattern_combo, AVG(quality_score) as avg_q, AVG(latency_ms) as avg_l, COUNT(*) as runs "
                "FROM pattern_performance GROUP BY pattern_combo ORDER BY avg_q DESC LIMIT 20"
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
