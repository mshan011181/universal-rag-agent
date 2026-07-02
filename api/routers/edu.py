"""MaximAI Edu router — parent-owned student profiles (TutorBottle-style).

One parent login owns multiple student profiles (name, grade, PIN). The parent
can switch into the Parent area (parent PIN) or any child profile (profile PIN)
and use the tutor on that child's behalf. This is separate from the
admin-provisioned account LMS in lms.py — both models coexist ("support both").
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth_utils import require_role_in, hash_password, verify_password
from src.memory.sqlite_store import get_conn, write_audit

router = APIRouter()

VALID_GRADES = {str(g) for g in range(1, 13)}  # Classes 1-12
BELTS = ["White", "Yellow", "Orange", "Green", "Blue", "Purple", "Brown", "Black"]


def _belt(study_count: int) -> str:
    return BELTS[min(len(BELTS) - 1, study_count // 10)]


def _org(user: dict) -> str:
    return user.get("org_id") or ""


def _owned(conn, user: dict, profile_id: int):
    """Return the profile row if it belongs to the caller (parent) or same-org admin."""
    row = conn.execute("SELECT * FROM student_profiles WHERE id=?", (profile_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    if user.get("role") in ("admin", "owner"):
        if row["org_id"] and row["org_id"] != _org(user):
            raise HTTPException(status_code=403, detail="Not in your organisation.")
    elif row["parent_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your student profile.")
    return row


# ── Models ────────────────────────────────────────────────────────────────────

class ProfileCreate(BaseModel):
    name: str
    grade: str
    pin: str = ""
    teaching_style: str = ""
    plan: str = "trial"
    valid_till: str = ""


class ProfileUpdate(BaseModel):
    name: str = ""
    grade: str = ""
    pin: str = ""
    teaching_style: str = ""


class PinBody(BaseModel):
    pin: str


class StudyBody(BaseModel):
    subject: str
    question: str
    language: str = "English"
    model: str = ""
    question_language: str = ""


# ── Profiles list / CRUD ──────────────────────────────────────────────────────

@router.get("/profiles")
async def list_profiles(user: dict = Depends(require_role_in({"parent"}))):
    with get_conn() as conn:
        me = conn.execute("SELECT full_name, email, parent_pin FROM users WHERE user_id=?",
                          (user["user_id"],)).fetchone()
        rows = conn.execute(
            "SELECT id, name, grade, plan, valid_till, teaching_style, pin, study_count "
            "FROM student_profiles WHERE parent_id=? ORDER BY created_at", (user["user_id"],)).fetchall()
    return {
        "parent": {"name": (me["full_name"] if me else "") or (me["email"] if me else "Parent"),
                   "has_pin": bool(me and (me["parent_pin"] or ""))},
        "profiles": [{
            "id": r["id"], "name": r["name"], "grade": r["grade"], "plan": r["plan"],
            "valid_till": r["valid_till"], "teaching_style": r["teaching_style"],
            "has_pin": bool(r["pin"]), "study_count": r["study_count"] or 0,
            "belt": _belt(r["study_count"] or 0),
        } for r in rows],
    }


@router.post("/profiles", status_code=201)
async def create_profile(body: ProfileCreate, user: dict = Depends(require_role_in({"parent"}))):
    grade = body.grade.strip()
    if not body.name.strip() or grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Name and a valid grade (1-12) are required.")
    pin_hash = hash_password(body.pin.strip()) if body.pin.strip() else ""
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO student_profiles (org_id, parent_id, name, grade, pin, teaching_style, plan, valid_till) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (_org(user), user["user_id"], body.name.strip(), grade, pin_hash,
             body.teaching_style.strip(), body.plan.strip() or "trial", body.valid_till.strip()))
        conn.commit()
    write_audit("edu_profile_created", user_id=user["user_id"], org_id=_org(user), detail={"grade": grade})
    return {"status": "created"}


@router.put("/profiles/{profile_id}")
async def update_profile(profile_id: int, body: ProfileUpdate, user: dict = Depends(require_role_in({"parent"}))):
    with get_conn() as conn:
        row = _owned(conn, user, profile_id)
        name = body.name.strip() or row["name"]
        grade = body.grade.strip() or row["grade"]
        if grade not in VALID_GRADES:
            raise HTTPException(status_code=422, detail="Valid grade (1-12) required.")
        pin_hash = hash_password(body.pin.strip()) if body.pin.strip() else row["pin"]
        ts = body.teaching_style.strip() if body.teaching_style else row["teaching_style"]
        conn.execute("UPDATE student_profiles SET name=?, grade=?, pin=?, teaching_style=? WHERE id=?",
                     (name, grade, pin_hash, ts, profile_id))
        conn.commit()
    return {"status": "updated"}


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: int, user: dict = Depends(require_role_in({"parent"}))):
    with get_conn() as conn:
        _owned(conn, user, profile_id)
        conn.execute("DELETE FROM student_profiles WHERE id=?", (profile_id,))
        conn.commit()
    return {"status": "deleted"}


# ── PIN gates ─────────────────────────────────────────────────────────────────

@router.post("/parent/verify-pin")
async def parent_pin(body: PinBody, user: dict = Depends(require_role_in({"parent"}))):
    """Verify the parent PIN. If none is set yet, the supplied PIN becomes the PIN."""
    pin = body.pin.strip()
    if not pin:
        raise HTTPException(status_code=422, detail="PIN required.")
    with get_conn() as conn:
        row = conn.execute("SELECT parent_pin FROM users WHERE user_id=?", (user["user_id"],)).fetchone()
        current = row["parent_pin"] if row else ""
        if not current:
            conn.execute("UPDATE users SET parent_pin=? WHERE user_id=?", (hash_password(pin), user["user_id"]))
            conn.commit()
            return {"status": "set", "ok": True}
        if not verify_password(pin, current):
            raise HTTPException(status_code=403, detail="Incorrect PIN.")
    return {"status": "verified", "ok": True}


@router.post("/profiles/{profile_id}/verify-pin")
async def profile_pin(profile_id: int, body: PinBody, user: dict = Depends(require_role_in({"parent"}))):
    pin = body.pin.strip()
    with get_conn() as conn:
        row = _owned(conn, user, profile_id)
        current = row["pin"] or ""
        if not current:
            if pin:
                conn.execute("UPDATE student_profiles SET pin=? WHERE id=?", (hash_password(pin), profile_id))
                conn.commit()
            return {"status": "set", "ok": True}
        if not pin or not verify_password(pin, current):
            raise HTTPException(status_code=403, detail="Incorrect PIN.")
    return {"status": "verified", "ok": True}


# ── Profile learning space ────────────────────────────────────────────────────

@router.get("/profiles/{profile_id}/courses")
async def profile_courses(profile_id: int, user: dict = Depends(require_role_in({"parent"}))):
    with get_conn() as conn:
        row = _owned(conn, user, profile_id)
        subs = conn.execute(
            "SELECT DISTINCT subject FROM course_materials WHERE org_id=? AND grade=? ORDER BY subject",
            (_org(user), row["grade"])).fetchall()
    return {"name": row["name"], "grade": row["grade"], "subjects": [s["subject"] for s in subs]}


@router.post("/profiles/{profile_id}/study")
async def profile_study(profile_id: int, body: StudyBody, user: dict = Depends(require_role_in({"parent"}))):
    if not body.question.strip():
        raise HTTPException(status_code=422, detail="Question is required.")
    with get_conn() as conn:
        row = _owned(conn, user, profile_id)
        grade, subject = row["grade"], body.subject.strip()
        srcs = conn.execute(
            "SELECT source_name FROM course_materials WHERE org_id=? AND grade=? AND subject=?",
            (_org(user), grade, subject)).fetchall()
        sources = [s["source_name"] for s in srcs]
    if not sources:
        raise HTTPException(status_code=404, detail="No study material for this grade/subject yet.")

    from src.agent import ask
    from src.generation.llm import get_token_usage
    # Personalise with the profile's teaching style.
    q = body.question.strip()
    if row["teaching_style"]:
        q = f"{q}\n\n(Teaching style preference: {row['teaching_style']})"
    resp, _ = ask(q, f"{user['user_id']}:edu:{profile_id}:{subject}", namespace=_org(user),
                  language=body.language, source_filters=sources, user_id=user["user_id"],
                  model_override=(body.model or None), question_language=body.question_language)
    with get_conn() as conn:
        conn.execute("UPDATE student_profiles SET study_count = study_count + 1 WHERE id=?", (profile_id,))
        conn.commit()
    tu = get_token_usage()
    return {"answer": resp.answer_text, "figures": getattr(resp, "figures", []) or [],
            "model_used": tu.get("model", "") or (body.model or "default")}


@router.get("/profiles/{profile_id}/badges")
async def profile_badges(profile_id: int, user: dict = Depends(require_role_in({"parent"}))):
    with get_conn() as conn:
        row = _owned(conn, user, profile_id)
    sc = row["study_count"] or 0
    tiers = [{"name": f"{b} Belt", "at": i * 10, "earned": sc >= i * 10} for i, b in enumerate(BELTS)]
    return {"name": row["name"], "study_count": sc, "belt": _belt(sc), "belts": tiers}
