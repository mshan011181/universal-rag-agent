"""
audit.py — Audit log query, export, retention policy, and GDPR erasure (admin only).

GET  /api/audit/logs            — paginated log with optional filters
GET  /api/audit/summary         — event counts by type (last 30 days)
GET  /api/audit/export          — download full audit log as CSV
GET  /api/audit/retention       — get current retention policy
PUT  /api/audit/retention       — update retention days
POST /api/audit/purge           — manually purge logs older than retention period
DELETE /api/audit/users/{uid}/erase — GDPR right to erasure for a specific user
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional

from api.auth_utils import get_current_user
from src.memory.sqlite_store import (
    get_audit_logs, get_conn,
    get_retention_policy, set_retention_policy,
    purge_audit_logs, export_audit_logs_csv, erase_user_data,
    write_audit,
)

router = APIRouter()


def _require_admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")


# ── Logs ─────────────────────────────────────────────────────────────────────

@router.get("/logs")
async def list_audit_logs(
    event_type: Optional[str] = Query(None),
    since: Optional[str]      = Query(None),
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


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary")
async def audit_summary(user: dict = Depends(get_current_user)):
    """Per-event-type counts for last 30 days (admin only)."""
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


# ── Export (CSV download) ─────────────────────────────────────────────────────

@router.get("/export")
async def export_audit_csv(
    event_type: Optional[str] = Query(None),
    since: Optional[str]      = Query(None, description="ISO datetime — export entries after this date"),
    user: dict                 = Depends(get_current_user),
):
    """
    Download the full audit log as a CSV file (admin only).
    Use this to take a backup before purging old logs.
    """
    _require_admin(user)
    csv_data = export_audit_logs_csv(
        org_id=user["org_id"],
        event_type=event_type,
        since=since,
    )
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"audit_log_{user['org_id'][:8]}_{timestamp}.csv"

    return Response(
        content=csv_data.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Retention policy ──────────────────────────────────────────────────────────

@router.get("/retention")
async def get_retention(user: dict = Depends(get_current_user)):
    """Return the org's data retention settings (admin only)."""
    _require_admin(user)
    policy = get_retention_policy(user["org_id"])
    return policy


class RetentionUpdate(BaseModel):
    audit_log_days:    int = Field(90, ge=7, le=3650, description="Days to keep audit log entries (7–3650)")
    conversation_days: int = Field(90, ge=7, le=3650, description="Days to keep conversation history (7–3650)")


@router.put("/retention")
async def update_retention(body: RetentionUpdate, user: dict = Depends(get_current_user)):
    """Update the org's data retention policy (admin only)."""
    _require_admin(user)
    set_retention_policy(user["org_id"], body.audit_log_days, body.conversation_days)
    write_audit("retention_policy_updated", user_id=user["user_id"], org_id=user["org_id"],
                detail={"audit_log_days": body.audit_log_days, "conversation_days": body.conversation_days})
    return {
        "message": "Retention policy updated.",
        "audit_log_days": body.audit_log_days,
        "conversation_days": body.conversation_days,
    }


# ── Purge ─────────────────────────────────────────────────────────────────────

@router.post("/purge")
async def purge_logs(user: dict = Depends(get_current_user)):
    """
    Manually purge audit log entries older than the org's retention period (admin only).
    Always export/download the CSV first as a backup.
    """
    _require_admin(user)
    policy = get_retention_policy(user["org_id"])
    days = policy["audit_log_days"]
    deleted = purge_audit_logs(user["org_id"], days)
    write_audit("audit_purge", user_id=user["user_id"], org_id=user["org_id"],
                detail={"deleted_rows": deleted, "older_than_days": days})
    return {
        "message": f"Purged {deleted} audit log entries older than {days} days.",
        "deleted_rows": deleted,
        "retention_days": days,
    }


# ── GDPR Right to Erasure ─────────────────────────────────────────────────────

@router.delete("/users/{target_user_id}/erase")
async def erase_user(target_user_id: str, user: dict = Depends(get_current_user)):
    """
    GDPR Article 17 — Right to Erasure.
    Permanently deletes all data for the target user within the org:
    audit log entries, conversation history, ingest history, user account.
    Admin cannot erase themselves.
    """
    _require_admin(user)

    if target_user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Admins cannot erase their own account.")

    # Confirm the target belongs to this org before erasing
    with get_conn() as conn:
        target = conn.execute(
            "SELECT email, org_id FROM users WHERE user_id=? AND org_id=?",
            (target_user_id, user["org_id"])
        ).fetchone()

    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organisation.")

    target_email = target["email"]
    deleted = erase_user_data(target_user_id, user["org_id"])

    write_audit("gdpr_erasure", user_id=user["user_id"], org_id=user["org_id"],
                detail={"erased_user_id": target_user_id, "erased_email": target_email, "rows_deleted": deleted})

    return {
        "message": f"All data for {target_email} has been permanently deleted.",
        "erased_user_id": target_user_id,
        "erased_email": target_email,
        "rows_deleted": deleted,
    }
