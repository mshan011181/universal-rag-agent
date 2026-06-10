"""
sso.py — SSO / OIDC endpoints for Azure AD (Entra ID) and Google Workspace.

Flow:
  GET /api/auth/sso/{provider}/login     → build auth URL, redirect to IdP
  GET /api/auth/sso/{provider}/callback  → exchange code, fetch userinfo,
                                           find/create user, redirect frontend with JWT

Supported providers:  azure | google

Setup (add to .env):
  SSO_AZURE_CLIENT_ID=<app-id>
  SSO_AZURE_CLIENT_SECRET=<secret>
  SSO_AZURE_TENANT_ID=<tenant-id or 'common'>   # 'common' = any Azure AD tenant
  SSO_GOOGLE_CLIENT_ID=<client-id>
  SSO_GOOGLE_CLIENT_SECRET=<secret>
  API_BASE_URL=http://localhost:8000              # backend base URL (for redirect_uri)
"""

import secrets
import uuid
import httpx
from datetime import datetime, timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from src.config import (
    SSO_AZURE_CLIENT_ID, SSO_AZURE_CLIENT_SECRET, SSO_AZURE_TENANT_ID,
    SSO_GOOGLE_CLIENT_ID, SSO_GOOGLE_CLIENT_SECRET,
    APP_BASE_URL, API_BASE_URL,
)
from api.auth_utils import create_access_token, create_refresh_token, hash_password
from src.memory.sqlite_store import get_conn, write_audit

router = APIRouter()

# ── State table (CSRF protection) ─────────────────────────────────────────────

def _ensure_sso_states_table():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sso_states (
                state    TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def _save_state(state: str, provider: str):
    _ensure_sso_states_table()
    # Expire old states (> 10 min)
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM sso_states WHERE created_at < datetime('now', '-10 minutes')"
        )
        conn.execute(
            "INSERT OR REPLACE INTO sso_states (state, provider) VALUES (?,?)",
            (state, provider)
        )
        conn.commit()


def _pop_state(state: str) -> str | None:
    """Validate and consume a state. Returns provider name or None."""
    _ensure_sso_states_table()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT provider FROM sso_states WHERE state=? AND created_at >= datetime('now', '-10 minutes')",
            (state,)
        ).fetchone()
        if row:
            conn.execute("DELETE FROM sso_states WHERE state=?", (state,))
            conn.commit()
    return row["provider"] if row else None


# ── Provider helpers ──────────────────────────────────────────────────────────

def _provider_config(provider: str) -> dict:
    tenant = SSO_AZURE_TENANT_ID or "common"
    configs = {
        "azure": {
            "auth_url":     f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
            "token_url":    f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            "userinfo_url": "https://graph.microsoft.com/oidc/userinfo",
            "scopes":       "openid email profile",
            "client_id":     SSO_AZURE_CLIENT_ID,
            "client_secret": SSO_AZURE_CLIENT_SECRET,
            "enabled":       bool(SSO_AZURE_CLIENT_ID and SSO_AZURE_CLIENT_SECRET),
        },
        "google": {
            "auth_url":     "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url":    "https://oauth2.googleapis.com/token",
            "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
            "scopes":       "openid email profile",
            "client_id":     SSO_GOOGLE_CLIENT_ID,
            "client_secret": SSO_GOOGLE_CLIENT_SECRET,
            "enabled":       bool(SSO_GOOGLE_CLIENT_ID and SSO_GOOGLE_CLIENT_SECRET),
        },
    }
    cfg = configs.get(provider)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Unknown SSO provider: {provider}")
    if not cfg["enabled"]:
        raise HTTPException(
            status_code=503,
            detail=f"{provider.title()} SSO is not configured. "
                   f"Set SSO_{provider.upper()}_CLIENT_ID and SSO_{provider.upper()}_CLIENT_SECRET in .env"
        )
    return cfg


def _redirect_uri(provider: str) -> str:
    return f"{API_BASE_URL}/api/auth/sso/{provider}/callback"


# ── User provisioning ─────────────────────────────────────────────────────────

def _ensure_sso_column():
    """Add sso_provider column to users table if it doesn't exist."""
    with get_conn() as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "sso_provider" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN sso_provider TEXT")
            conn.commit()


def _find_or_create_sso_user(email: str, name: str, provider: str) -> dict:
    """
    Find existing user by email or auto-provision a new one.
    SSO users get a random password hash (they never use password login).
    First SSO login creates a personal org with the user as admin.
    """
    _ensure_sso_column()

    with get_conn() as conn:
        row = conn.execute(
            "SELECT user_id, org_id, role FROM users WHERE email=?",
            (email.lower(),)
        ).fetchone()

    if row:
        # Existing user — update sso_provider if not set
        with get_conn() as conn:
            conn.execute(
                "UPDATE users SET sso_provider=? WHERE user_id=? AND sso_provider IS NULL",
                (provider, row["user_id"])
            )
            conn.commit()
        return {"user_id": row["user_id"], "org_id": row["org_id"], "role": row["role"]}

    # Auto-provision new user
    user_id = str(uuid.uuid4())
    org_id  = str(uuid.uuid4())
    # Use display name or email prefix as org name
    org_name = name or email.split("@")[0].replace(".", " ").title()
    random_pw_hash = hash_password(secrets.token_urlsafe(32))

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO organisations (org_id, org_name, owner_id) VALUES (?,?,?)",
            (org_id, f"{org_name}'s workspace", user_id)
        )
        conn.execute(
            """INSERT INTO users (user_id, email, hashed_password, org_id, role, sso_provider)
               VALUES (?,?,?,?,?,?)""",
            (user_id, email.lower(), random_pw_hash, org_id, "admin", provider)
        )
        conn.commit()

    write_audit("register", user_id=user_id, email=email, org_id=org_id,
                detail={"role": "admin", "org_action": "create", "method": f"sso_{provider}"})
    return {"user_id": user_id, "org_id": org_id, "role": "admin"}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/providers")
async def list_providers():
    """Return which SSO providers are configured (for frontend to show/hide buttons)."""
    tenant = SSO_AZURE_TENANT_ID or "common"
    return {
        "azure":  bool(SSO_AZURE_CLIENT_ID and SSO_AZURE_CLIENT_SECRET),
        "google": bool(SSO_GOOGLE_CLIENT_ID and SSO_GOOGLE_CLIENT_SECRET),
        "azure_tenant": tenant,
    }


@router.get("/{provider}/login")
async def sso_login(provider: str):
    """Initiate SSO: redirect browser to IdP authorization URL."""
    cfg = _provider_config(provider)
    state = secrets.token_urlsafe(32)
    _save_state(state, provider)

    params = {
        "client_id":     cfg["client_id"],
        "response_type": "code",
        "redirect_uri":  _redirect_uri(provider),
        "scope":         cfg["scopes"],
        "state":         state,
        "prompt":        "select_account",   # force account picker
    }
    url = cfg["auth_url"] + "?" + urlencode(params)
    return RedirectResponse(url=url, status_code=302)


@router.get("/{provider}/callback")
async def sso_callback(
    provider: str,
    code: str = Query(..., description="Authorization code from IdP"),
    state: str = Query(..., description="CSRF state token"),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    """
    Handle IdP callback: exchange code for tokens, fetch user info,
    find/create user, redirect frontend with our JWT.
    """
    # IdP-reported error (e.g. user cancelled)
    if error:
        msg = error_description or error
        return RedirectResponse(
            url=f"{APP_BASE_URL}/login?sso_error={msg}",
            status_code=302
        )

    # Validate CSRF state
    stored_provider = _pop_state(state)
    if not stored_provider or stored_provider != provider:
        return RedirectResponse(
            url=f"{APP_BASE_URL}/login?sso_error=Invalid+state+parameter.+Please+try+again.",
            status_code=302
        )

    cfg = _provider_config(provider)

    # Exchange code for tokens
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_res = await client.post(
                cfg["token_url"],
                data={
                    "client_id":     cfg["client_id"],
                    "client_secret": cfg["client_secret"],
                    "code":          code,
                    "redirect_uri":  _redirect_uri(provider),
                    "grant_type":    "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            token_res.raise_for_status()
            token_data = token_res.json()

            access_token = token_data.get("access_token")
            if not access_token:
                raise ValueError("No access_token in IdP response")

            # Fetch userinfo
            userinfo_res = await client.get(
                cfg["userinfo_url"],
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_res.raise_for_status()
            userinfo = userinfo_res.json()

    except Exception as exc:
        return RedirectResponse(
            url=f"{APP_BASE_URL}/login?sso_error=SSO+token+exchange+failed:+{str(exc)[:80]}",
            status_code=302
        )

    # Extract email and name from userinfo
    email = (
        userinfo.get("email") or
        userinfo.get("mail") or          # Azure Graph sometimes uses 'mail'
        userinfo.get("preferred_username") or ""
    ).lower().strip()

    if not email or "@" not in email:
        return RedirectResponse(
            url=f"{APP_BASE_URL}/login?sso_error=IdP+did+not+return+an+email+address.",
            status_code=302
        )

    name = (
        userinfo.get("name") or
        userinfo.get("displayName") or
        userinfo.get("given_name", "") + " " + userinfo.get("family_name", "")
    ).strip()

    # Find or create user
    user = _find_or_create_sso_user(email, name, provider)

    write_audit("login", user_id=user["user_id"], email=email, org_id=user["org_id"],
                detail={"method": f"sso_{provider}"})

    # Issue our JWT
    payload = {"sub": user["user_id"], "org_id": user["org_id"], "role": user["role"]}
    our_access  = create_access_token(payload)
    our_refresh = create_refresh_token(payload)

    # Redirect frontend to the SSO callback page with tokens in URL params
    # (short-lived — frontend immediately moves to sessionStorage)
    redirect_url = (
        f"{APP_BASE_URL}/sso/callback"
        f"?token={our_access}"
        f"&refresh={our_refresh}"
        f"&email={email}"
        f"&role={user['role']}"
    )
    return RedirectResponse(url=redirect_url, status_code=302)
