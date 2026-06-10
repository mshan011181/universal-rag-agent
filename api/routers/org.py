"""
org.py — Organisation management endpoints.

All routes require JWT auth. Admin-only routes additionally check role='admin'.

Endpoints:
  GET  /api/org/info              — get org name, plan, member count
  GET  /api/org/members           — list all members (admin only)
  POST /api/org/invite            — send email invite to a new member (admin only)
  GET  /api/org/invite/{token}    — validate invite token (public — used by register page)
  DELETE /api/org/members/{uid}   — remove a member (admin only, cannot remove self)
"""

import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from api.auth_utils import get_current_user
from api.email_service import send_org_invite
from src.memory.sqlite_store import get_conn
from src.config import APP_BASE_URL

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")


def _get_org(org_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT org_id, org_name, owner_id, plan, created_at FROM organisations WHERE org_id=?",
            (org_id,)
        ).fetchone()
    if not row:
        return {"org_id": org_id, "org_name": "Personal workspace", "plan": "free"}
    return dict(row)


# ── Models ────────────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: EmailStr


class UpdateOrgRequest(BaseModel):
    org_name: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/info")
async def get_org_info(user: dict = Depends(get_current_user)):
    """Return current org details."""
    org = _get_org(user["org_id"])
    # Count members
    with get_conn() as conn:
        count_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM users WHERE org_id=?", (user["org_id"],)
        ).fetchone()
    org["member_count"] = count_row["cnt"] if count_row else 1
    return org


@router.put("/info")
async def update_org_info(body: UpdateOrgRequest, user: dict = Depends(get_current_user)):
    """Update org name (admin only)."""
    _require_admin(user)
    org_name = body.org_name.strip()
    if not org_name:
        raise HTTPException(status_code=400, detail="Organisation name cannot be empty.")
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT org_id FROM organisations WHERE org_id=?", (user["org_id"],)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE organisations SET org_name=? WHERE org_id=?",
                (org_name, user["org_id"])
            )
        else:
            conn.execute(
                "INSERT INTO organisations (org_id, org_name, owner_id) VALUES (?,?,?)",
                (user["org_id"], org_name, user["user_id"])
            )
        conn.commit()
    return {"org_name": org_name}


@router.get("/members")
async def list_members(user: dict = Depends(get_current_user)):
    """List all members in the org (admin only)."""
    _require_admin(user)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT user_id, email, role, created_at FROM users WHERE org_id=? ORDER BY created_at",
            (user["org_id"],)
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/invite", status_code=201)
async def invite_member(body: InviteRequest, user: dict = Depends(get_current_user)):
    """Send an email invite to a new member (admin only)."""
    _require_admin(user)

    email = body.email.lower().strip()

    # Check not already a member
    with get_conn() as conn:
        already = conn.execute(
            "SELECT 1 FROM users WHERE email=? AND org_id=?", (email, user["org_id"])
        ).fetchone()
    if already:
        raise HTTPException(status_code=409, detail="This email is already a member of your organisation.")

    # Expire any existing unused invite for same org+email
    with get_conn() as conn:
        conn.execute(
            "UPDATE org_invites SET used=1 WHERE org_id=? AND invited_email=? AND used=0",
            (user["org_id"], email)
        )
        conn.commit()

    # Create invite token (7 day TTL)
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO org_invites (token, org_id, invited_email, invited_by, expires_at)
               VALUES (?,?,?,?,?)""",
            (token, user["org_id"], email, user["email"], expires_at)
        )
        conn.commit()

    # Build invite link
    invite_link = f"{APP_BASE_URL}/register?invite={token}"

    # Get org name
    org = _get_org(user["org_id"])
    org_name = org.get("org_name", "your team")

    # Send email (falls back silently if Resend not configured)
    sent = send_org_invite(email, user["email"], org_name, invite_link)

    return {
        "message": f"Invite sent to {email}",
        "invite_link": invite_link,   # always returned so admin can copy-paste if email fails
        "email_sent": sent,
    }


@router.get("/invite/{token}")
async def validate_invite(token: str):
    """Validate an invite token — called by the register page to pre-fill org info."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT org_id, invited_email, expires_at FROM org_invites
               WHERE token=? AND used=0""",
            (token,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid or already used invite link.")
    if datetime.utcnow() > datetime.fromisoformat(row["expires_at"]):
        raise HTTPException(status_code=410, detail="Invite link has expired.")

    org = _get_org(row["org_id"])
    return {
        "valid": True,
        "org_id": row["org_id"],
        "org_name": org.get("org_name", ""),
        "invited_email": row["invited_email"],
    }


@router.delete("/members/{target_user_id}", status_code=200)
async def remove_member(target_user_id: str, user: dict = Depends(get_current_user)):
    """Remove a member from the org (admin only, cannot remove self or org owner)."""
    _require_admin(user)

    if target_user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot remove yourself.")

    with get_conn() as conn:
        target = conn.execute(
            "SELECT email, role FROM users WHERE user_id=? AND org_id=?",
            (target_user_id, user["org_id"])
        ).fetchone()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in your organisation.")

    # Check not the org owner
    org = _get_org(user["org_id"])
    if org.get("owner_id") == target_user_id:
        raise HTTPException(status_code=403, detail="Cannot remove the organisation owner.")

    with get_conn() as conn:
        conn.execute(
            "DELETE FROM users WHERE user_id=? AND org_id=?",
            (target_user_id, user["org_id"])
        )
        conn.commit()

    return {"message": f"Removed {target['email']} from your organisation."}
