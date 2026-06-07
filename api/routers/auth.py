import uuid
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


def _ensure_users_table() -> None:
    """Create users table if it doesn't exist (idempotent)."""
    try:
        with get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    hashed_password TEXT NOT NULL,
                    org_id TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
    except Exception:
        pass  # Table may already exist


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
