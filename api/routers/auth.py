import uuid
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from api.auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token, hash_api_key
)

router = APIRouter()

# In production: replace with PostgreSQL queries
_users_store: dict = {}


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


@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    body.validate_password()
    if body.email in _users_store:
        raise HTTPException(status_code=409, detail="Email already registered")

    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    _users_store[body.email] = {
        "user_id": user_id,
        "org_id": org_id,
        "hashed_password": hash_password(body.password),
        "role": "admin",
    }
    return {"user_id": user_id, "email": body.email, "org_id": org_id}


@router.post("/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user = _users_store.get(form.username)
    if not user or not verify_password(form.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    payload = {"sub": user["user_id"], "org_id": user["org_id"], "role": user["role"]}
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
