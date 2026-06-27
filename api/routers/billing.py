"""
billing.py — Razorpay payments (Phase 3).

Flow:
  1. POST /create-order  → creates a Razorpay order for a plan, returns order +
     key_id for the browser checkout.
  2. Browser opens Razorpay Checkout; on success it returns payment_id +
     signature.
  3. POST /verify        → verifies the signature server-side, then upgrades the
     user's plan (sets plan + plan_expires_at).
  4. POST /webhook       → reliability backup: Razorpay calls this on
     payment.captured; verified via the webhook secret, upgrades the plan from
     the order notes (handles the case where the user closed the browser).

All Razorpay calls use the REST API with HTTP Basic auth (key_id:key_secret) —
no extra dependency. Amounts are in the smallest currency unit (USD cents).
"""

import base64
import hashlib
import hmac
import json
import urllib.request
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.auth_utils import get_current_user_or_api_key
from src.config import (
    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RAZORPAY_CURRENCY,
)
from src.memory.sqlite_store import get_conn, write_audit

logger = structlog.get_logger()
router = APIRouter()

# Plan → price (smallest unit, e.g. USD cents) + duration. Adjust freely.
PLAN_PRICES = {
    "monthly":   {"amount": 499,  "days": 30,  "label": "Monthly"},
    "quarterly": {"amount": 1299, "days": 92,  "label": "Quarterly"},
    "yearly":    {"amount": 3999, "days": 365, "label": "Yearly"},
}


# ── Plan storage (users table) ────────────────────────────────────────────────

def _ensure_plan_columns() -> None:
    """Add plan / plan_expires_at columns to users (idempotent, both DBs)."""
    for ddl in (
        "ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'",
        "ALTER TABLE users ADD COLUMN plan_expires_at TEXT",
    ):
        try:
            with get_conn() as c:
                c.execute(ddl)
                c.commit()
        except Exception:
            pass  # column already exists


def get_user_plan(user_id: str) -> tuple[str, str | None]:
    """Return (effective_plan, expires_at). Expired paid plans read as 'free'."""
    try:
        with get_conn() as c:
            row = c.execute(
                "SELECT plan, plan_expires_at FROM users WHERE user_id=?", (user_id,)
            ).fetchone()
    except Exception:
        return ("free", None)
    if not row:
        return ("free", None)
    plan = (row[0] or "free")
    exp = row[1]
    if plan != "free" and exp:
        try:
            if datetime.fromisoformat(exp) < datetime.utcnow():
                return ("free", exp)  # lapsed → treat as free
        except Exception:
            pass
    return (plan, exp)


def _set_user_plan(user_id: str, plan: str, expires_at: str | None) -> None:
    with get_conn() as c:
        c.execute(
            "UPDATE users SET plan=?, plan_expires_at=? WHERE user_id=?",
            (plan, expires_at, user_id),
        )
        c.commit()


# ── Razorpay REST helpers ─────────────────────────────────────────────────────

def _razorpay_auth_header() -> str:
    raw = f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def _razorpay_create_order(amount: int, currency: str, receipt: str, notes: dict) -> dict:
    body = json.dumps({
        "amount": amount, "currency": currency, "receipt": receipt[:40],
        "notes": notes, "payment_capture": 1,
    }).encode()
    req = urllib.request.Request(
        "https://api.razorpay.com/v1/orders", data=body, method="POST",
        headers={"Authorization": _razorpay_auth_header(), "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:  # nosec B310
        return json.loads(r.read())


# ── Endpoints ─────────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    plan: str


@router.post("/create-order")
async def create_order(body: CreateOrderRequest, user: dict = Depends(get_current_user_or_api_key)):
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(status_code=503, detail="Payments are not configured yet.")
    plan = body.plan.lower()
    if plan not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail="Unknown plan.")
    cfg = PLAN_PRICES[plan]
    try:
        order = _razorpay_create_order(
            amount=cfg["amount"], currency=RAZORPAY_CURRENCY,
            receipt=f"{user['user_id'][:24]}-{plan}",
            notes={"user_id": user["user_id"], "plan": plan},
        )
    except Exception as e:
        logger.error("razorpay_order_failed", error=str(e), user_id=user["user_id"])
        raise HTTPException(status_code=502, detail=f"Could not create payment order: {e}")
    return {
        "order_id": order["id"],
        "amount": cfg["amount"],
        "currency": RAZORPAY_CURRENCY,
        "key_id": RAZORPAY_KEY_ID,
        "plan": plan,
    }


class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str


@router.post("/verify")
async def verify_payment(body: VerifyRequest, user: dict = Depends(get_current_user_or_api_key)):
    plan = body.plan.lower()
    if plan not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail="Unknown plan.")
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment verification failed.")

    expires = (datetime.utcnow() + timedelta(days=PLAN_PRICES[plan]["days"])).isoformat()
    _set_user_plan(user["user_id"], plan, expires)
    write_audit(event_type="subscription", user_id=user["user_id"], org_id=user.get("org_id"),
                detail={"plan": plan, "payment_id": body.razorpay_payment_id, "expires_at": expires})
    logger.info("subscription_activated", user_id=user["user_id"], plan=plan, expires_at=expires)
    return {"status": "active", "plan": plan, "expires_at": expires}


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Backup confirmation from Razorpay (payment.captured). No-op if the webhook
    secret isn't configured."""
    raw = await request.body()
    if not RAZORPAY_WEBHOOK_SECRET:
        return {"status": "ignored"}
    sig = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")
    try:
        event = json.loads(raw)
        entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        notes = entity.get("notes", {}) or {}
        user_id = notes.get("user_id")
        plan = (notes.get("plan") or "").lower()
        if event.get("event") == "payment.captured" and user_id and plan in PLAN_PRICES:
            expires = (datetime.utcnow() + timedelta(days=PLAN_PRICES[plan]["days"])).isoformat()
            _set_user_plan(user_id, plan, expires)
            logger.info("subscription_activated_webhook", user_id=user_id, plan=plan)
    except Exception as e:
        logger.error("razorpay_webhook_error", error=str(e))
    return {"status": "ok"}


# Ensure the plan columns exist at import time.
_ensure_plan_columns()
