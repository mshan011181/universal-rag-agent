import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import JWTError, jwt
import bcrypt
import structlog

logger = structlog.get_logger()

JWT_SECRET = os.getenv("JWT_SECRET", "change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_password(password: str) -> str:
    """Hash password using bcrypt directly (bypasses passlib/bcrypt incompatibility)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against bcrypt hash."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")
    return {"user_id": user_id, "org_id": payload.get("org_id"), "role": payload.get("role", "user")}


async def get_current_user_or_api_key(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Security(api_key_header),
):
    if api_key:
        # Validate API key from DB
        key_hash = hash_api_key(api_key)
        # DB lookup would go here in real implementation
        return {"user_id": "api_key_user", "org_id": None, "role": "user", "auth_method": "api_key"}
    if token:
        user = await get_current_user(token)
        user["auth_method"] = "jwt"
        return user
    raise HTTPException(status_code=401, detail="Authentication required")


def require_role(required_role: str):
    async def checker(user=Depends(get_current_user)):
        roles = {"readonly": 0, "user": 1, "admin": 2}
        if roles.get(user["role"], 0) < roles.get(required_role, 99):
            raise HTTPException(status_code=403, detail=f"Role '{required_role}' required")
        return user
    return checker
