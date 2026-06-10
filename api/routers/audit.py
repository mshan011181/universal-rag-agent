"""
audit.py — Audit log query endpoints (admin only).

GET /api/audit/logs    — paginated log with optional event_type + since filters
GET /api/audit/summary — event counts by type for dashboard widgets
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from api.auth_utils import get_current_user
from src.memory.sqlite_store import get_audit_logs, get_conn

router = APIRouter()


def _require_admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")


@router.get("/logs")
async def list_audit_logs(
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    since: Optional[str]      = Query(None, description="ISO datetime — return entries after this timestamp"),
    limit: int                 = Query(100, ge=1, le=500),
    offset: int                = Query(0, ge=0),
    user: dict                 = Depends(get_current_user),
):
    """Return audit log entries for the caller's org, newest first (admin only)."""
    _require_admin(user)
    logs = get_audit_logs(
        org_id=user["org_id"],
        event_type=event_type,
        limit=limit,
        offset=offset,
        since=since,
    )
    return {"logs": logs, "count": len(logs)}


@router.get("/summary")
async def audit_summary(user: dict = Depends(get_current_user)):
    """Return per-event-type counts for the last 30 days (admin only)."""
    _require_admin(user)
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT event_type,
                      COUNT(*) as total,
                      SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failures,
                      MAX(created_at) as last_seen
               FROM audit_log
               WHERE org_id=?
                 AND created_at >= datetime('now', '-30 days')
               GROUP BY event_type
               ORDER BY total DESC""",
            (user["org_id"],)
        ).fetchall()
    return [dict(r) for r in rows]
