"""
email_service.py — SMTP email delivery for OTP / magic-link flows.

Reads config from environment via src.config:
  SMTP_HOST      e.g. smtp.gmail.com
  SMTP_PORT      e.g. 587  (STARTTLS)
  SMTP_USER      sender email address
  SMTP_PASSWORD  app password (Gmail 16-char, or provider secret)
  SMTP_FROM      display From address (defaults to SMTP_USER)
  APP_BASE_URL   e.g. http://localhost:3000  (used in links)
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, APP_BASE_URL

logger = logging.getLogger(__name__)


def _send(to: str, subject: str, html: str) -> bool:
    """Send one email. Returns True on success, False on failure."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — email not sent to %s", to)
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SMTP_FROM or SMTP_USER
        msg["To"]      = to
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to, msg.as_string())
        logger.info("Email sent to %s | subject=%s", to, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
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
