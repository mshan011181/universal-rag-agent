import random
import uuid
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from api.auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token,
)
from api.email_service import send_registration_otp, send_reset_otp
from src.memory.sqlite_store import get_conn, write_audit
from src.config import APP_BASE_URL

router = APIRouter()


# ── DB helpers ────────────────────────────────────────────────────────────────

def _ensure_users_table() -> None:
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                org_id TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                storage_quota_bytes INTEGER DEFAULT 524288000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "storage_quota_bytes" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN storage_quota_bytes INTEGER DEFAULT 524288000")
        if "full_name" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''")
        if "grade" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN grade TEXT DEFAULT ''")
        if "parent_pin" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN parent_pin TEXT DEFAULT ''")
        conn.commit()


def _ensure_otp_table() -> None:
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                otp TEXT NOT NULL,
                purpose TEXT NOT NULL,   -- 'register' | 'reset'
                token TEXT,              -- for reset: the URL token
                expires_at TEXT NOT NULL,
                used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def _ensure_reset_table() -> None:
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER DEFAULT 0
            )
        """)
        conn.commit()


def _generate_otp(length: int = 6) -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(length))


def _invalidate_otps(email: str, purpose: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE email_otps SET used=1 WHERE email=? AND purpose=? AND used=0",
            (email, purpose)
        )
        conn.commit()


# ── Pydantic models ───────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    email: EmailStr
    purpose: str = "register"   # "register" | "reset"


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str
    purpose: str = "register"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    otp: str                       # must be verified before account is created
    org_action: str = "create"     # "create" | "join"
    org_name: str | None = None    # required when org_action="create"
    invite_token: str | None = None  # required when org_action="join"

    def validate_password(self) -> None:
        if len(self.password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
        if len(self.password.encode("utf-8")) > 72:
            raise HTTPException(status_code=422, detail="Password must be 72 characters or fewer")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


# ── OTP: send ─────────────────────────────────────────────────────────────────

@router.post("/send-otp", status_code=200)
async def send_otp(body: SendOTPRequest):
    """Send a 6-digit OTP to the given email for registration or password reset."""
    _ensure_users_table()
    _ensure_otp_table()

    email = body.email.lower().strip()

    if body.purpose == "register":
        # Block if email already registered
        with get_conn() as conn:
            exists = conn.execute(
                "SELECT 1 FROM users WHERE email=?", (email,)
            ).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="Email already registered. Please sign in.")

    if body.purpose == "reset":
        # Only send if user exists (but don't reveal which emails exist)
        with get_conn() as conn:
            exists = conn.execute(
                "SELECT 1 FROM users WHERE email=?", (email,)
            ).fetchone()
        if not exists:
            # Anti-enumeration: pretend success
            return {"message": "If that email is registered, an OTP has been sent."}

    # Invalidate old OTPs for same email+purpose
    _invalidate_otps(email, body.purpose)

    otp = _generate_otp(6)
    ttl_minutes = 10 if body.purpose == "register" else 15
    expires_at = (datetime.utcnow() + timedelta(minutes=ttl_minutes)).isoformat()

    # For reset: also create a URL token so user can click a link
    reset_token = secrets.token_urlsafe(32) if body.purpose == "reset" else None

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO email_otps (email, otp, purpose, token, expires_at) VALUES (?,?,?,?,?)",
            (email, otp, body.purpose, reset_token, expires_at)
        )
        conn.commit()

    # Send email
    if body.purpose == "register":
        sent = send_registration_otp(email, otp)
    else:
        reset_link = f"{APP_BASE_URL}/reset-password?token={reset_token}"
        sent = send_reset_otp(email, otp, reset_link)

    if not sent:
        # Resend not configured — return OTP in response for local dev
        return {
            "message": "RESEND_API_KEY not configured. Use the OTP below for testing.",
            "dev_otp": otp,          # remove in production
            "expires_in": f"{ttl_minutes} minutes",
        }

    return {"message": f"OTP sent to {email}. Valid for {ttl_minutes} minutes."}


# ── OTP: verify (lightweight check — used for UX feedback) ───────────────────

@router.post("/verify-otp", status_code=200)
async def verify_otp(body: VerifyOTPRequest):
    """Check if an OTP is valid WITHOUT consuming it (used for step-1 UX feedback)."""
    _ensure_otp_table()
    email = body.email.lower().strip()

    with get_conn() as conn:
        row = conn.execute(
            """SELECT expires_at FROM email_otps
               WHERE email=? AND otp=? AND purpose=? AND used=0
               ORDER BY created_at DESC LIMIT 1""",
            (email, body.otp.strip(), body.purpose)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid OTP. Check the code and try again.")
    if datetime.utcnow() > datetime.fromisoformat(row[0]):
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new one.")

    return {"valid": True}


# ── Register (with OTP) ───────────────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    """Create account — OTP must match a valid registration OTP for the email."""
    body.validate_password()
    _ensure_users_table()
    _ensure_otp_table()

    email = body.email.lower().strip()

    # Verify and consume the OTP
    with get_conn() as conn:
        row = conn.execute(
            """SELECT id, expires_at FROM email_otps
               WHERE email=? AND otp=? AND purpose='register' AND used=0
               ORDER BY created_at DESC LIMIT 1""",
            (email, body.otp.strip())
        ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid OTP. Request a new verification code.")
    if datetime.utcnow() > datetime.fromisoformat(row[1]):
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new code.")

    # Consume OTP
    with get_conn() as conn:
        conn.execute("UPDATE email_otps SET used=1 WHERE id=?", (row[0],))
        conn.commit()

    user_id = str(uuid.uuid4())

    # ── Determine org_id and role based on org_action ──────────────────────
    if body.org_action == "join":
        # Validate invite token
        if not body.invite_token:
            raise HTTPException(status_code=400, detail="Invite token required to join an organisation.")
        with get_conn() as conn:
            inv = conn.execute(
                """SELECT org_id, invited_email, expires_at FROM org_invites
                   WHERE token=? AND used=0""",
                (body.invite_token.strip(),)
            ).fetchone()
        if not inv:
            raise HTTPException(status_code=400, detail="Invalid or already used invite link.")
        if datetime.utcnow() > datetime.fromisoformat(inv["expires_at"]):
            raise HTTPException(status_code=400, detail="Invite link has expired. Ask your admin for a new one.")
        if inv["invited_email"] and inv["invited_email"].lower() != email:
            raise HTTPException(status_code=403, detail="This invite was sent to a different email address.")
        org_id = inv["org_id"]
        role   = "member"
        # Mark invite as used
        with get_conn() as conn:
            conn.execute("UPDATE org_invites SET used=1 WHERE token=?", (body.invite_token.strip(),))
            conn.commit()
    else:
        # Create new organisation
        org_name = (body.org_name or "").strip()
        if not org_name:
            raise HTTPException(status_code=400, detail="Organisation name is required.")
        org_id = str(uuid.uuid4())
        role   = "admin"
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO organisations (org_id, org_name, owner_id) VALUES (?,?,?)",
                (org_id, org_name, user_id)
            )
            conn.commit()

    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO users (user_id, email, hashed_password, org_id, role) VALUES (?,?,?,?,?)",
                (user_id, email, hash_password(body.password), org_id, role)
            )
            conn.commit()
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=500, detail="Registration failed")

    write_audit("register", user_id=user_id, email=email, org_id=org_id,
                detail={"role": role, "org_action": body.org_action})
    return {"user_id": user_id, "email": email, "org_id": org_id, "role": role}


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    _ensure_users_table()

    try:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT user_id, hashed_password, org_id, role FROM users WHERE email=?",
                (form.username.lower().strip(),)
            ).fetchone()
    except Exception:
        row = None

    email_input = form.username.lower().strip()
    if not row:
        write_audit("login_failed", email=email_input, status="failure",
                    detail={"reason": "email_not_found"})
        raise HTTPException(status_code=401, detail="email_not_found")
    if not verify_password(form.password, row[1]):
        write_audit("login_failed", user_id=row[0], email=email_input,
                    org_id=row[2], status="failure", detail={"reason": "wrong_password"})
        raise HTTPException(status_code=401, detail="wrong_password")

    user_id, org_id, role = row[0], row[2], row[3]
    write_audit("login", user_id=user_id, email=email_input, org_id=org_id)
    payload = {"sub": user_id, "org_id": org_id, "role": role}
    return TokenResponse(
        access_token=create_access_token(payload),
        refresh_token=create_refresh_token(payload),
    )


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_token: str):
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    new_payload = {"sub": payload["sub"], "org_id": payload.get("org_id"), "role": payload.get("role", "user")}
    return TokenResponse(
        access_token=create_access_token(new_payload),
        refresh_token=create_refresh_token(new_payload),
    )


# ── Forgot password: send OTP email ──────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Trigger OTP + reset-link email. Delegates to /send-otp internally."""
    return await send_otp(SendOTPRequest(email=body.email, purpose="reset"))


# ── Reset password with OTP ───────────────────────────────────────────────────

@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Reset password by verifying OTP (or URL token stored alongside OTP)."""
    _ensure_otp_table()

    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")
    if len(body.new_password.encode("utf-8")) > 72:
        raise HTTPException(status_code=422, detail="Password must be 72 characters or fewer")

    email = body.email.lower().strip()

    with get_conn() as conn:
        row = conn.execute(
            """SELECT id, expires_at FROM email_otps
               WHERE email=? AND otp=? AND purpose='reset' AND used=0
               ORDER BY created_at DESC LIMIT 1""",
            (email, body.otp.strip())
        ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid OTP. Request a new reset code.")
    if datetime.utcnow() > datetime.fromisoformat(row[1]):
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new one.")

    # Get user
    with get_conn() as conn:
        user = conn.execute(
            "SELECT user_id FROM users WHERE email=?", (email,)
        ).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Consume OTP and update password
    with get_conn() as conn:
        conn.execute("UPDATE email_otps SET used=1 WHERE id=?", (row[0],))
        conn.execute(
            "UPDATE users SET hashed_password=? WHERE user_id=?",
            (hash_password(body.new_password), user[0])
        )
        conn.commit()

    write_audit("password_reset", user_id=user[0], email=body.email.lower().strip(),
                detail={"method": "otp"})
    return {"message": "Password updated successfully. You can now sign in."}


# ── Reset via URL token (link in email) ───────────────────────────────────────

class ResetByTokenRequest(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password-by-token")
async def reset_password_by_token(body: ResetByTokenRequest):
    """Reset password using the URL token from the email link (alternative to OTP entry)."""
    _ensure_otp_table()

    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    with get_conn() as conn:
        row = conn.execute(
            """SELECT id, email, expires_at FROM email_otps
               WHERE token=? AND purpose='reset' AND used=0
               ORDER BY created_at DESC LIMIT 1""",
            (body.token,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if datetime.utcnow() > datetime.fromisoformat(row[2]):
        raise HTTPException(status_code=400, detail="Reset link has expired. Request a new one.")

    otp_id, email = row[0], row[1]

    with get_conn() as conn:
        user = conn.execute("SELECT user_id FROM users WHERE email=?", (email,)).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    with get_conn() as conn:
        conn.execute("UPDATE email_otps SET used=1 WHERE id=?", (otp_id,))
        conn.execute(
            "UPDATE users SET hashed_password=? WHERE user_id=?",
            (hash_password(body.new_password), user[0])
        )
        conn.commit()

    write_audit("password_reset", user_id=user[0], email=email,
                detail={"method": "token"})
    return {"message": "Password updated successfully. You can now sign in."}
