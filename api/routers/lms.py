"""LMS router — school learning platform on top of the RAG/grading engines.

Phase A: roles + admin user management + parent/teacher linking.
Roles: admin | teacher | student | parent (owner/admin manage everything).
All rows are scoped by org_id for multi-tenant safety.
"""
import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from api.auth_utils import get_current_user, require_role_in, hash_password
from src.memory.sqlite_store import get_conn, write_audit

router = APIRouter()

VALID_ROLES = {"admin", "teacher", "student", "parent"}
VALID_GRADES = {"9", "10", "11", "12"}


def _org(user: dict) -> str:
    org = user.get("org_id")
    if not org:
        raise HTTPException(status_code=400, detail="No organisation on this account.")
    return org


# ── Models ──────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str = ""
    role: str
    grade: str = ""          # required for students
    password: str = ""       # optional; a temp password is generated if blank


class LinkParentRequest(BaseModel):
    parent_id: str
    student_id: str


class TeacherSubjectRequest(BaseModel):
    teacher_id: str
    grade: str
    subject: str


# ── Admin: user management ────────────────────────────────────────────────────

@router.get("/users")
async def list_users(role: str = "", user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    with get_conn() as conn:
        if role:
            rows = conn.execute(
                "SELECT user_id, email, full_name, role, grade, created_at FROM users "
                "WHERE org_id=? AND role=? ORDER BY role, full_name, email", (org, role)).fetchall()
        else:
            rows = conn.execute(
                "SELECT user_id, email, full_name, role, grade, created_at FROM users "
                "WHERE org_id=? ORDER BY role, full_name, email", (org,)).fetchall()
    return {"users": [
        {"user_id": r["user_id"], "email": r["email"], "full_name": r["full_name"] or "",
         "role": r["role"], "grade": r["grade"] or ""} for r in rows]}


@router.post("/users", status_code=201)
async def create_user(body: CreateUserRequest, user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    role = body.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of {sorted(VALID_ROLES)}")
    grade = body.grade.strip()
    if role == "student" and grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Students require a grade (9-12).")
    email = str(body.email).lower().strip()
    password = body.password.strip() or secrets.token_urlsafe(9)

    with get_conn() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="Email already registered.")
        uid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO users (user_id, email, hashed_password, org_id, role, full_name, grade) "
            "VALUES (?,?,?,?,?,?,?)",
            (uid, email, hash_password(password), org, role, body.full_name.strip(), grade))
        conn.commit()
    write_audit("lms_user_created", user_id=user["user_id"], org_id=org,
                detail={"new_user": uid, "role": role, "grade": grade})
    # Return the temp password once so the admin can share it.
    return {"user_id": uid, "email": email, "role": role, "grade": grade,
            "temp_password": password if not body.password.strip() else None}


@router.delete("/users/{target_id}")
async def delete_user(target_id: str, user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    if target_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account here.")
    with get_conn() as conn:
        row = conn.execute("SELECT role FROM users WHERE user_id=? AND org_id=?", (target_id, org)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found in your organisation.")
        conn.execute("DELETE FROM users WHERE user_id=? AND org_id=?", (target_id, org))
        conn.execute("DELETE FROM parent_children WHERE org_id=? AND (parent_id=? OR student_id=?)",
                     (org, target_id, target_id))
        conn.execute("DELETE FROM teacher_subjects WHERE org_id=? AND teacher_id=?", (org, target_id))
        conn.commit()
    write_audit("lms_user_deleted", user_id=user["user_id"], org_id=org, detail={"deleted": target_id})
    return {"status": "deleted", "user_id": target_id}


# ── Admin: parent ↔ child links ───────────────────────────────────────────────

@router.get("/parent-links")
async def list_parent_links(user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT pc.id, pc.parent_id, pc.student_id,
                      p.email AS parent_email, p.full_name AS parent_name,
                      s.email AS student_email, s.full_name AS student_name, s.grade AS grade
               FROM parent_children pc
               JOIN users p ON p.user_id = pc.parent_id
               JOIN users s ON s.user_id = pc.student_id
               WHERE pc.org_id=? ORDER BY p.full_name, s.full_name""", (org,)).fetchall()
    return {"links": [dict(r) for r in rows]}


@router.post("/parent-links", status_code=201)
async def link_parent(body: LinkParentRequest, user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    with get_conn() as conn:
        p = conn.execute("SELECT role FROM users WHERE user_id=? AND org_id=?", (body.parent_id, org)).fetchone()
        s = conn.execute("SELECT role FROM users WHERE user_id=? AND org_id=?", (body.student_id, org)).fetchone()
        if not p or p["role"] != "parent":
            raise HTTPException(status_code=422, detail="parent_id is not a parent in your organisation.")
        if not s or s["role"] != "student":
            raise HTTPException(status_code=422, detail="student_id is not a student in your organisation.")
        dup = conn.execute("SELECT 1 FROM parent_children WHERE org_id=? AND parent_id=? AND student_id=?",
                           (org, body.parent_id, body.student_id)).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail="This parent-child link already exists.")
        conn.execute("INSERT INTO parent_children (org_id, parent_id, student_id) VALUES (?,?,?)",
                     (org, body.parent_id, body.student_id))
        conn.commit()
    write_audit("lms_parent_linked", user_id=user["user_id"], org_id=org,
                detail={"parent": body.parent_id, "student": body.student_id})
    return {"status": "linked"}


@router.delete("/parent-links/{link_id}")
async def unlink_parent(link_id: int, user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    with get_conn() as conn:
        conn.execute("DELETE FROM parent_children WHERE id=? AND org_id=?", (link_id, org))
        conn.commit()
    return {"status": "unlinked"}


# ── Admin: teacher ↔ subject assignments ──────────────────────────────────────

@router.get("/teacher-subjects")
async def list_teacher_subjects(user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT ts.id, ts.teacher_id, ts.grade, ts.subject,
                      t.email AS teacher_email, t.full_name AS teacher_name
               FROM teacher_subjects ts
               JOIN users t ON t.user_id = ts.teacher_id
               WHERE ts.org_id=? ORDER BY t.full_name, ts.grade, ts.subject""", (org,)).fetchall()
    return {"assignments": [dict(r) for r in rows]}


@router.post("/teacher-subjects", status_code=201)
async def assign_teacher_subject(body: TeacherSubjectRequest, user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    if body.grade.strip() not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Grade must be 9-12.")
    if not body.subject.strip():
        raise HTTPException(status_code=422, detail="Subject is required.")
    with get_conn() as conn:
        t = conn.execute("SELECT role FROM users WHERE user_id=? AND org_id=?", (body.teacher_id, org)).fetchone()
        if not t or t["role"] != "teacher":
            raise HTTPException(status_code=422, detail="teacher_id is not a teacher in your organisation.")
        conn.execute("INSERT INTO teacher_subjects (org_id, teacher_id, grade, subject) VALUES (?,?,?,?)",
                     (org, body.teacher_id, body.grade.strip(), body.subject.strip()))
        conn.commit()
    write_audit("lms_teacher_assigned", user_id=user["user_id"], org_id=org,
                detail={"teacher": body.teacher_id, "grade": body.grade, "subject": body.subject})
    return {"status": "assigned"}


@router.delete("/teacher-subjects/{assign_id}")
async def unassign_teacher_subject(assign_id: int, user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    with get_conn() as conn:
        conn.execute("DELETE FROM teacher_subjects WHERE id=? AND org_id=?", (assign_id, org))
        conn.commit()
    return {"status": "removed"}


# ── Shared: current user's LMS profile (role, grade, full name) ────────────────

@router.get("/me")
async def my_profile(user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT email, full_name, role, grade FROM users WHERE user_id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user_id": user["user_id"], "email": row["email"], "full_name": row["full_name"] or "",
            "role": row["role"], "grade": row["grade"] or ""}
