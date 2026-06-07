import uuid
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from api.auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token, hash_api_key
)
from src.memory.sqlite_store import get_conn

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    org_name: str = "default"

    def validate_password(self) -> None:
        if len(self.password.encode("utf-8")) > 72:
            raise HTTPException(
                status_code=422,
                detail="Password must be 72 characters or fewer (bcrypt limit)"
            )


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


def _ensure_reset_table() -> None:
    """Create password_reset_tokens table if missing."""
    try:
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
    except Exception:
        pass


def _ensure_users_table() -> None:
    """Create users table if it doesn't exist and migrate columns (idempotent)."""
    try:
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
            # Migrate: add storage_quota_bytes if missing
            cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
            if "storage_quota_bytes" not in cols:
                conn.execute("ALTER TABLE users ADD COLUMN storage_quota_bytes INTEGER DEFAULT 524288000")
            conn.commit()
    except Exception:
        pass


@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    body.validate_password()
    _ensure_users_table()

    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())

    try:
        with get_conn() as conn:
            conn.execute(
                """INSERT INTO users (user_id, email, hashed_password, org_id, role)
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, body.email, hash_password(body.password), org_id, "admin")
            )
            conn.commit()
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=500, detail="Registration failed")

    return {"user_id": user_id, "email": body.email, "org_id": org_id}


@router.post("/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    _ensure_users_table()

    try:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT user_id, hashed_password, org_id, role FROM users WHERE email = ?",
                (form.username,)
            ).fetchone()
    except Exception:
        row = None

    if not row:
        raise HTTPException(status_code=401, detail="email_not_found")
    if not verify_password(form.password, row[1]):
        raise HTTPException(status_code=401, detail="wrong_password")

    user_id, org_id, role = row[0], row[2], row[3]
    payload = {"sub": user_id, "org_id": org_id, "role": role}
    return TokenResponse(
        access_token=create_access_token(payload),
        refresh_token=create_refresh_token(payload),
    )


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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Generate a password reset token. Returns the token in response (no email server needed)."""
    _ensure_users_table()
    _ensure_reset_table()

    with get_conn() as conn:
        row = conn.execute(
            "SELECT user_id FROM users WHERE email = ?", (body.email,)
        ).fetchone()

    # Always return 200 to avoid email enumeration
    if not row:
        return {"message": "If that email exists, a reset link has been generated.", "token": None}

    user_id = row[0]
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(hours=1)).isoformat()

    with get_conn() as conn:
        # Invalidate any existing unused tokens for this user
        conn.execute(
            "UPDATE password_reset_tokens SET used=1 WHERE user_id=? AND used=0",
            (user_id,)
        )
        conn.execute(
            "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires_at)
        )
        conn.commit()

    return {
        "message": "Password reset link generated. Copy the link below and open it in your browser.",
        "token": token,
        "expires_in": "1 hour",
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Reset password using a valid token."""
    _ensure_reset_table()

    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    if len(body.new_password.encode("utf-8")) > 72:
        raise HTTPException(status_code=422, detail="Password must be 72 characters or fewer")

    with get_conn() as conn:
        row = conn.execute(
            "SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token=?",
            (body.token,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user_id, expires_at, used = row
    if used:
        raise HTTPException(status_code=400, detail="This reset link has already been used")
    if datetime.utcnow() > datetime.fromisoformat(expires_at):
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    new_hash = hash_password(body.new_password)

    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET hashed_password=? WHERE user_id=?",
            (new_hash, user_id)
        )
        conn.execute(
            "UPDATE password_reset_tokens SET used=1 WHERE token=?",
            (body.token,)
        )
        conn.commit()

    return {"message": "Password updated successfully. You can now sign in."}
