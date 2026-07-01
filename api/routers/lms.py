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


# ── LMS scoping helpers ───────────────────────────────────────────────────────

def _resolve_sources(conn, org: str, grade: str, subject: str) -> list[str]:
    rows = conn.execute(
        "SELECT source_name FROM course_materials WHERE org_id=? AND grade=? AND subject=?",
        (org, grade, subject)).fetchall()
    return [r["source_name"] for r in rows]


def _student_grade(conn, user_id: str) -> str:
    row = conn.execute("SELECT grade FROM users WHERE user_id=?", (user_id,)).fetchone()
    return (row["grade"] or "") if row else ""


def _child_grades(conn, org: str, parent_id: str) -> set[str]:
    rows = conn.execute(
        """SELECT s.grade AS grade FROM parent_children pc
           JOIN users s ON s.user_id = pc.student_id
           WHERE pc.org_id=? AND pc.parent_id=?""", (org, parent_id)).fetchall()
    return {r["grade"] for r in rows if r["grade"]}


def _teacher_pairs(conn, org: str, teacher_id: str) -> set[tuple[str, str]]:
    rows = conn.execute(
        "SELECT grade, subject FROM teacher_subjects WHERE org_id=? AND teacher_id=?",
        (org, teacher_id)).fetchall()
    return {(r["grade"], r["subject"]) for r in rows}


def _may_study(conn, user: dict, org: str, grade: str, subject: str) -> bool:
    role = user.get("role")
    if role in ("admin", "owner"):
        return True
    if role == "student":
        return grade == _student_grade(conn, user["user_id"])
    if role == "parent":
        return grade in _child_grades(conn, org, user["user_id"])
    if role == "teacher":
        return (grade, subject) in _teacher_pairs(conn, org, user["user_id"])
    return False


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


# ── Content library: tag ingested books to a grade + subject (admin) ───────────
# Admin uploads NCERT books via the existing Ingest page (handles large STEM PDFs
# via Marker), then tags each ingested document here to a grade + subject.

class MaterialRequest(BaseModel):
    grade: str
    subject: str
    source_name: str
    ingest_id: str = ""


@router.get("/materials")
async def list_materials(user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, grade, subject, source_name, ingest_id, created_at FROM course_materials "
            "WHERE org_id=? ORDER BY grade, subject, source_name", (org,)).fetchall()
    return {"materials": [dict(r) for r in rows]}


@router.post("/materials", status_code=201)
async def add_material(body: MaterialRequest, user: dict = Depends(require_role_in({"admin"}))):
    org = _org(user)
    if body.grade.strip() not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Grade must be 9-12.")
    if not body.subject.strip() or not body.source_name.strip():
        raise HTTPException(status_code=422, detail="Subject and source document are required.")
    with get_conn() as conn:
        dup = conn.execute(
            "SELECT 1 FROM course_materials WHERE org_id=? AND grade=? AND subject=? AND source_name=?",
            (org, body.grade.strip(), body.subject.strip(), body.source_name.strip())).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail="This document is already tagged for that grade+subject.")
        conn.execute(
            "INSERT INTO course_materials (org_id, grade, subject, source_name, ingest_id, uploaded_by) "
            "VALUES (?,?,?,?,?,?)",
            (org, body.grade.strip(), body.subject.strip(), body.source_name.strip(),
             body.ingest_id.strip(), user["user_id"]))
        conn.commit()
    write_audit("lms_material_tagged", user_id=user["user_id"], org_id=org,
                detail={"grade": body.grade, "subject": body.subject, "source": body.source_name})
    return {"status": "tagged"}


@router.delete("/materials/{material_id}")
async def delete_material(material_id: int, user: dict = Depends(require_role_in({"admin"}))):
    """Remove the grade+subject tag. Does NOT delete the ingested document itself."""
    org = _org(user)
    with get_conn() as conn:
        conn.execute("DELETE FROM course_materials WHERE id=? AND org_id=?", (material_id, org))
        conn.commit()
    return {"status": "removed"}


# ── My courses: subjects the caller can study, per role ────────────────────────

@router.get("/my-courses")
async def my_courses(user: dict = Depends(get_current_user)):
    org = user.get("org_id") or ""
    role = user.get("role")
    with get_conn() as conn:
        if role == "student":
            grade = _student_grade(conn, user["user_id"])
            rows = conn.execute(
                "SELECT DISTINCT subject FROM course_materials WHERE org_id=? AND grade=? ORDER BY subject",
                (org, grade)).fetchall()
            return {"grade": grade, "courses": [{"grade": grade, "subject": r["subject"]} for r in rows]}
        if role == "teacher":
            rows = conn.execute(
                "SELECT grade, subject FROM teacher_subjects WHERE org_id=? AND teacher_id=? ORDER BY grade, subject",
                (org, user["user_id"])).fetchall()
            return {"courses": [{"grade": r["grade"], "subject": r["subject"]} for r in rows]}
        if role == "parent":
            rows = conn.execute(
                """SELECT s.user_id AS student_id, s.full_name AS student_name, s.email AS student_email,
                          s.grade AS grade, cm.subject AS subject
                   FROM parent_children pc
                   JOIN users s ON s.user_id = pc.student_id
                   JOIN course_materials cm ON cm.org_id = pc.org_id AND cm.grade = s.grade
                   WHERE pc.org_id=? AND pc.parent_id=?
                   ORDER BY s.full_name, cm.subject""", (org, user["user_id"])).fetchall()
            return {"courses": [dict(r) for r in rows]}
        # admin / owner: everything with materials
        rows = conn.execute(
            "SELECT DISTINCT grade, subject FROM course_materials WHERE org_id=? ORDER BY grade, subject",
            (org,)).fetchall()
        return {"courses": [{"grade": r["grade"], "subject": r["subject"]} for r in rows]}


# ── Scoped study Q&A ──────────────────────────────────────────────────────────

class StudyRequest(BaseModel):
    grade: str
    subject: str
    question: str
    language: str = "English"
    model: str = ""
    question_language: str = ""


@router.post("/study")
async def study(body: StudyRequest, user: dict = Depends(get_current_user)):
    org = user.get("org_id") or ""
    grade, subject = body.grade.strip(), body.subject.strip()
    if not body.question.strip():
        raise HTTPException(status_code=422, detail="Question is required.")
    with get_conn() as conn:
        if not _may_study(conn, user, org, grade, subject):
            raise HTTPException(status_code=403, detail="You do not have access to this grade/subject.")
        sources = _resolve_sources(conn, org, grade, subject)
    if not sources:
        raise HTTPException(status_code=404, detail="No study material has been added for this grade/subject yet.")

    from src.agent import ask
    from src.generation.llm import get_token_usage
    scoped_session = f"{user['user_id']}:lms:{grade}:{subject}"
    resp, _ = ask(body.question.strip(), scoped_session, namespace=org, language=body.language,
                  source_filters=sources, user_id=user["user_id"],
                  model_override=(body.model or None), question_language=body.question_language)
    write_audit("lms_study", user_id=user["user_id"], org_id=org,
                detail={"grade": grade, "subject": subject})
    tu = get_token_usage()
    return {
        "answer": resp.answer_text,
        "figures": getattr(resp, "figures", []) or [],
        "quality_score": getattr(resp, "quality_score", 0.0),
        "model_used": tu.get("model", "") or (body.model or "default"),
        "token_usage": tu,
    }


# ── Assignments: create (teacher) → submit (student) → grade → gradebook ───────

class AssignmentRequest(BaseModel):
    grade: str
    subject: str
    title: str
    instructions: str = ""
    questions: list[str] = []
    rubric: str = ""
    model: str = ""
    due_date: str = ""


class SubmitRequest(BaseModel):
    answers: list[str] = []


def _may_teach(conn, user: dict, org: str, grade: str, subject: str) -> bool:
    role = user.get("role")
    if role in ("admin", "owner"):
        return True
    if role == "teacher":
        return (grade, subject) in _teacher_pairs(conn, org, user["user_id"])
    return False


@router.post("/assignments", status_code=201)
async def create_assignment(body: AssignmentRequest, user: dict = Depends(require_role_in({"teacher", "admin"}))):
    import json as _json
    org = _org(user)
    grade, subject = body.grade.strip(), body.subject.strip()
    questions = [q.strip() for q in body.questions if q.strip()]
    if grade not in VALID_GRADES or not subject or not body.title.strip() or not questions:
        raise HTTPException(status_code=422, detail="grade, subject, title and at least one question are required.")
    with get_conn() as conn:
        if not _may_teach(conn, user, org, grade, subject):
            raise HTTPException(status_code=403, detail="You are not assigned to this grade/subject.")
        conn.execute(
            "INSERT INTO assignments (org_id, teacher_id, grade, subject, title, instructions, "
            "questions_json, rubric, model, due_date) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (org, user["user_id"], grade, subject, body.title.strip(), body.instructions.strip(),
             _json.dumps(questions), body.rubric.strip(), body.model.strip(), body.due_date.strip()))
        conn.commit()
    write_audit("lms_assignment_created", user_id=user["user_id"], org_id=org,
                detail={"grade": grade, "subject": subject, "questions": len(questions)})
    return {"status": "created"}


@router.get("/assignments")
async def list_assignments(user: dict = Depends(get_current_user)):
    import json as _json
    org = user.get("org_id") or ""
    role = user.get("role")
    with get_conn() as conn:
        if role == "teacher":
            rows = conn.execute(
                "SELECT * FROM assignments WHERE org_id=? AND teacher_id=? ORDER BY created_at DESC",
                (org, user["user_id"])).fetchall()
        elif role in ("admin", "owner"):
            rows = conn.execute("SELECT * FROM assignments WHERE org_id=? ORDER BY created_at DESC", (org,)).fetchall()
        elif role == "student":
            grade = _student_grade(conn, user["user_id"])
            rows = conn.execute(
                "SELECT * FROM assignments WHERE org_id=? AND grade=? ORDER BY created_at DESC", (org, grade)).fetchall()
        else:
            rows = []
        out = []
        for r in rows:
            d = dict(r)
            d["questions"] = _json.loads(d.pop("questions_json", "[]") or "[]")
            d["num_questions"] = len(d["questions"])
            if role == "student":
                d.pop("questions", None)  # students fetch questions via detail on open
                sub = conn.execute(
                    "SELECT score, status FROM submissions WHERE assignment_id=? AND student_id=?",
                    (d["id"], user["user_id"])).fetchone()
                d["submission_status"] = sub["status"] if sub else "not_started"
                d["submission_score"] = sub["score"] if sub else None
            out.append(d)
    return {"assignments": out}


@router.get("/assignments/{aid}")
async def get_assignment(aid: int, user: dict = Depends(get_current_user)):
    import json as _json
    org = user.get("org_id") or ""
    with get_conn() as conn:
        r = conn.execute("SELECT * FROM assignments WHERE id=? AND org_id=?", (aid, org)).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        d = dict(r)
        # Students may only open assignments for their own grade.
        if user.get("role") == "student" and d["grade"] != _student_grade(conn, user["user_id"]):
            raise HTTPException(status_code=403, detail="Not your grade.")
    d["questions"] = _json.loads(d.pop("questions_json", "[]") or "[]")
    return d


@router.post("/assignments/{aid}/submit")
async def submit_assignment(aid: int, body: SubmitRequest, user: dict = Depends(require_role_in({"student"}))):
    import json as _json
    from types import SimpleNamespace
    from src.agent import ask
    from api.routers.query import _evaluate_answer, _build_gap_analysis
    org = user.get("org_id") or ""
    with get_conn() as conn:
        r = conn.execute("SELECT * FROM assignments WHERE id=? AND org_id=?", (aid, org)).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        grade = r["grade"]
        if grade != _student_grade(conn, user["user_id"]):
            raise HTTPException(status_code=403, detail="Not your grade.")
        dup = conn.execute("SELECT 1 FROM submissions WHERE assignment_id=? AND student_id=?",
                           (aid, user["user_id"])).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail="You have already submitted this assignment.")
        subject, rubric, model = r["subject"], r["rubric"] or "", r["model"] or ""
        questions = _json.loads(r["questions_json"] or "[]")
        sources = _resolve_sources(conn, org, grade, subject)

    scoped_session = f"{user['user_id']}:lms:submit:{aid}"
    results = []
    for i, q in enumerate(questions):
        student_ans = body.answers[i] if i < len(body.answers) else ""
        try:
            ref_resp, _ = ask(q, scoped_session, namespace=org, source_filters=sources,
                              user_id=user["user_id"], model_override=(model or None))
            reference = ref_resp.answer_text
        except Exception as e:
            reference = f"(reference unavailable: {e})"
        ev = _evaluate_answer(q, student_ans, reference, model_override=(model or None), rubric=rubric)
        results.append({"question": q, "student_answer": student_ans, "score": ev["score"],
                        "verdict": ev["verdict"], "mistakes": ev["mistakes"],
                        "corrections": ev["corrections"], "feedback": ev["feedback"]})
    overall = round(sum(x["score"] for x in results) / len(results)) if results else 0
    gap = _build_gap_analysis([SimpleNamespace(**x) for x in results], model or None) if results else ""

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO submissions (assignment_id, student_id, answers_json, score, results_json, "
            "gap_analysis, status, graded_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
            (aid, user["user_id"], _json.dumps(body.answers), overall, _json.dumps(results), gap, "graded"))
        conn.commit()
    write_audit("lms_submission_graded", user_id=user["user_id"], org_id=org,
                detail={"assignment": aid, "score": overall})
    return {"score": overall, "results": results, "gap_analysis": gap}


@router.get("/assignments/{aid}/submissions")
async def assignment_submissions(aid: int, user: dict = Depends(require_role_in({"teacher", "admin"}))):
    import json as _json
    org = user.get("org_id") or ""
    with get_conn() as conn:
        a = conn.execute("SELECT * FROM assignments WHERE id=? AND org_id=?", (aid, org)).fetchone()
        if not a:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        rows = conn.execute(
            """SELECT sub.id, sub.student_id, sub.score, sub.status, sub.gap_analysis, sub.results_json,
                      sub.submitted_at, s.full_name AS student_name, s.email AS student_email
               FROM submissions sub JOIN users s ON s.user_id = sub.student_id
               WHERE sub.assignment_id=? ORDER BY s.full_name""", (aid,)).fetchall()
    subs = []
    for r in rows:
        d = dict(r)
        d["results"] = _json.loads(d.pop("results_json", "[]") or "[]")
        subs.append(d)
    return {"assignment": {"id": a["id"], "title": a["title"], "grade": a["grade"], "subject": a["subject"]},
            "submissions": subs}


@router.get("/my-results")
async def my_results(user: dict = Depends(require_role_in({"student"}))):
    import json as _json
    org = user.get("org_id") or ""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT sub.id, sub.score, sub.status, sub.gap_analysis, sub.results_json, sub.submitted_at,
                      a.title AS title, a.subject AS subject, a.grade AS grade
               FROM submissions sub JOIN assignments a ON a.id = sub.assignment_id
               WHERE sub.student_id=? AND a.org_id=? ORDER BY sub.submitted_at DESC""",
            (user["user_id"], org)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["results"] = _json.loads(d.pop("results_json", "[]") or "[]")
        out.append(d)
    return {"results": out}


@router.get("/children/{student_id}/results")
async def child_results(student_id: str, user: dict = Depends(require_role_in({"parent", "admin"}))):
    org = user.get("org_id") or ""
    with get_conn() as conn:
        if user.get("role") == "parent":
            linked = conn.execute("SELECT 1 FROM parent_children WHERE org_id=? AND parent_id=? AND student_id=?",
                                  (org, user["user_id"], student_id)).fetchone()
            if not linked:
                raise HTTPException(status_code=403, detail="That student is not linked to your account.")
        rows = conn.execute(
            """SELECT sub.id, sub.score, sub.status, sub.gap_analysis, sub.submitted_at,
                      a.title AS title, a.subject AS subject, a.grade AS grade
               FROM submissions sub JOIN assignments a ON a.id = sub.assignment_id
               WHERE sub.student_id=? AND a.org_id=? ORDER BY sub.submitted_at DESC""",
            (student_id, org)).fetchall()
    return {"results": [dict(r) for r in rows]}
