"""
email_service.py — Resend API email delivery for OTP / magic-link flows.

Reads config from environment via src.config:
  RESEND_API_KEY   API key from resend.com (starts with re_)
  EMAIL_FROM       Sender address (default: onboarding@resend.dev for testing)
  APP_BASE_URL     e.g. http://localhost:3000  (used in links)

Free tier: 3000 emails/month, 100/day. No custom domain required for testing.
Sign up at https://resend.com → API Keys → Create API Key
"""

import logging
import resend

from src.config import RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL

logger = logging.getLogger(__name__)

# Set Resend API key once at import time
resend.api_key = RESEND_API_KEY


def _send(to: str, subject: str, html: str) -> bool:
    """Send one email via Resend API. Returns True on success, False on failure."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — email not sent to %s", to)
        return False
    try:
        params: resend.Emails.SendParams = {
            "from": EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        response = resend.Emails.send(params)
        logger.info("Email sent via Resend to %s | id=%s | subject=%s", to, response.get("id"), subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email via Resend to %s: %s", to, exc)
        return False


# ── Templates ─────────────────────────────────────────────────────────────────

def _base_html(title: str, body: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background:#f4f4f5; margin:0; padding:32px 0; }}
  .card {{ background:#fff; max-width:480px; margin:0 auto; border-radius:12px;
           box-shadow:0 1px 4px rgba(0,0,0,.10); overflow:hidden; }}
  .header {{ background:#2563eb; padding:28px 32px; text-align:center; }}
  .header h1 {{ color:#fff; margin:0; font-size:20px; font-weight:700; }}
  .header p  {{ color:#bfdbfe; margin:4px 0 0; font-size:13px; }}
  .body {{ padding:32px; }}
  .otp-box {{ background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;
              text-align:center; padding:20px; margin:24px 0; }}
  .otp {{ font-size:36px; font-weight:800; letter-spacing:10px; color:#0369a1;
          font-family:monospace; }}
  .otp-note {{ font-size:12px; color:#64748b; margin-top:8px; }}
  .btn {{ display:inline-block; background:#2563eb; color:#fff !important;
          text-decoration:none; padding:12px 28px; border-radius:8px;
          font-size:14px; font-weight:600; margin:16px 0; }}
  .footer {{ text-align:center; padding:20px 32px; font-size:11px; color:#94a3b8;
             border-top:1px solid #f1f5f9; }}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>Universal RAG Enterprise</h1>
    <p>{title}</p>
  </div>
  <div class="body">{body}</div>
  <div class="footer">
    This email was sent by Universal RAG Enterprise. If you did not request this, ignore it.
  </div>
</div>
</body>
</html>"""


def send_registration_otp(to: str, otp: str) -> bool:
    body = f"""
    <p style="color:#1e293b;font-size:15px;">Welcome! To complete your registration, enter the
    one-time code below:</p>
    <div class="otp-box">
      <div class="otp">{otp}</div>
      <div class="otp-note">Valid for <strong>10 minutes</strong>. Do not share this code.</div>
    </div>
    <p style="color:#64748b;font-size:13px;">If you did not create an account, you can safely ignore this email.</p>
    """
    return _send(
        to,
        "Your Universal RAG registration code",
        _base_html("Email Verification", body),
    )


def send_reset_otp(to: str, otp: str, reset_link: str) -> bool:
    body = f"""
    <p style="color:#1e293b;font-size:15px;">We received a password reset request for your account.
    Use the code below <strong>or</strong> click the button to reset your password:</p>
    <div class="otp-box">
      <div class="otp">{otp}</div>
      <div class="otp-note">Valid for <strong>15 minutes</strong>. Do not share this code.</div>
    </div>
    <div style="text-align:center;">
      <a href="{reset_link}" class="btn">Reset Password</a>
    </div>
    <p style="color:#64748b;font-size:12px;">
      Or copy this link:<br>
      <span style="word-break:break-all;color:#2563eb;">{reset_link}</span>
    </p>
    <p style="color:#64748b;font-size:12px;">
      If you did not request a password reset, your account is safe — ignore this email.
    </p>
    """
    return _send(
        to,
        "Reset your Universal RAG password",
        _base_html("Password Reset", body),
    )


def send_org_invite(to: str, invited_by: str, org_name: str, invite_link: str) -> bool:
    body = f"""
    <p style="color:#1e293b;font-size:15px;">
      <strong>{invited_by}</strong> has invited you to join the
      <strong>{org_name}</strong> workspace on Universal RAG Enterprise.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="{invite_link}" class="btn">Accept Invitation</a>
    </div>
    <p style="color:#64748b;font-size:12px;">
      Or copy this link:<br>
      <span style="word-break:break-all;color:#2563eb;">{invite_link}</span>
    </p>
    <p style="color:#64748b;font-size:12px;">This invite expires in 7 days.
    If you did not expect this invitation, you can safely ignore this email.</p>
    """
    return _send(
        to,
        f"You've been invited to {org_name} on Universal RAG",
        _base_html("Team Invitation", body),
    )
