import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from api.auth_utils import require_role
from api.auth_utils import hash_password
from src.memory.sqlite_store import get_conn

router = APIRouter()

UNLIMITED = -1  # sentinel for unlimited quota


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "user"


class UpdateQuotaRequest(BaseModel):
    quota_bytes: Optional[int] = None   # None or -1 = unlimited
    unlimited: bool = False


@router.get("/stats")
async def get_stats(user: dict = Depends(require_role("admin"))):
    user_id = user["user_id"]
    org_id = user.get("org_id", "")
    try:
        with get_conn() as conn:
            query_count = conn.execute(
                "SELECT COUNT(*) FROM conversation_history WHERE session_id LIKE ?",
                (f"{user_id}:%",)
            ).fetchone()[0]
            avg_quality = conn.execute("SELECT AVG(quality_score) FROM pattern_performance").fetchone()[0]
            pattern_rows = conn.execute(
                "SELECT pattern_combo, COUNT(*) as cnt FROM pattern_performance GROUP BY pattern_combo"
            ).fetchall()
            doc_count = conn.execute(
                "SELECT COUNT(*) FROM ingest_history WHERE user_id = ? AND status = 'done' AND chunks_created > 0",
                (user_id,)
            ).fetchone()[0]
            user_count = conn.execute(
                "SELECT COUNT(*) FROM users WHERE org_id = ?", (org_id,)
            ).fetchone()[0]
            pattern_breakdown = {row[0]: row[1] for row in pattern_rows}
    except Exception:
        query_count = 0
        avg_quality = 0.0
        doc_count = 0
        user_count = 1
        pattern_breakdown = {}

    return {
        "total_queries": query_count,
        "total_users": user_count,
        "total_documents": doc_count,
        "avg_quality_score": round(avg_quality or 0.0, 3),
        "pattern_breakdown": pattern_breakdown,
    }


@router.get("/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    try:
        with get_conn() as conn:
            rows = conn.execute("""
                SELECT u.user_id, u.email, u.org_id, u.role,
                       COALESCE(u.storage_quota_bytes, 524288000) as storage_quota_bytes,
                       u.created_at,
                       COUNT(i.ingest_id) as doc_count,
                       COALESCE(SUM(i.file_size_bytes), 0) as storage_used_bytes,
                       COALESCE(SUM(i.chunks_created), 0) as total_chunks
                FROM users u
                LEFT JOIN ingest_history i ON u.user_id = i.user_id AND i.status = 'done' AND i.chunks_created > 0
                GROUP BY u.user_id
                ORDER BY u.created_at DESC
            """).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []


@router.post("/users", status_code=201)
async def create_user(body: CreateUserRequest, admin: dict = Depends(require_role("admin"))):
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    try:
        with get_conn() as conn:
            conn.execute(
                """INSERT INTO users (user_id, email, hashed_password, org_id, role, storage_quota_bytes)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (user_id, body.email, hash_password(body.password), org_id, body.role, 524288000)
            )
            conn.commit()
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=500, detail="Failed to create user")

    return {"user_id": user_id, "email": body.email, "org_id": org_id, "role": body.role}


@router.delete("/users/{target_user_id}", status_code=200)
async def delete_user(target_user_id: str, admin: dict = Depends(require_role("admin"))):
    if target_user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    try:
        with get_conn() as conn:
            row = conn.execute("SELECT email FROM users WHERE user_id = ?", (target_user_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            conn.execute("DELETE FROM ingest_history WHERE user_id = ?", (target_user_id,))
            conn.execute("DELETE FROM users WHERE user_id = ?", (target_user_id,))
            conn.commit()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete user")

    return {"deleted": target_user_id}


@router.patch("/users/{target_user_id}/quota", status_code=200)
async def update_quota(target_user_id: str, body: UpdateQuotaRequest, admin: dict = Depends(require_role("admin"))):
    quota = UNLIMITED if body.unlimited else (body.quota_bytes if body.quota_bytes is not None else 524288000)
    try:
        with get_conn() as conn:
            row = conn.execute("SELECT user_id FROM users WHERE user_id = ?", (target_user_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            conn.execute("UPDATE users SET storage_quota_bytes = ? WHERE user_id = ?", (quota, target_user_id))
            conn.commit()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update quota")

    return {"user_id": target_user_id, "storage_quota_bytes": quota}


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
