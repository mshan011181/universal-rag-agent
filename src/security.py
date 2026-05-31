"""Input validation, PII detection, prompt injection prevention."""
import re
from typing import Optional


# ── Prompt injection detection ───────────────────────────────────────────────
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"you\s+are\s+now\s+(a\s+)?different",
    r"disregard\s+(your\s+)?system\s+prompt",
    r"act\s+as\s+(if\s+you\s+are\s+)?a",
    r"jailbreak",
    r"DAN\s+mode",
    r"<\s*script",
    r"system\s*:",
    r"\[INST\]",
    r"###\s*instruction",
]

_injection_re = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)


def detect_prompt_injection(query: str) -> bool:
    return bool(_injection_re.search(query))


# ── PII detection ────────────────────────────────────────────────────────────
PII_PATTERNS = {
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "phone": re.compile(r"\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ip_address": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
}


def detect_pii(text: str) -> dict[str, bool]:
    return {pii_type: bool(pattern.search(text)) for pii_type, pattern in PII_PATTERNS.items()}


def redact_pii(text: str) -> str:
    text = PII_PATTERNS["ssn"].sub("[SSN-REDACTED]", text)
    text = PII_PATTERNS["credit_card"].sub("[CC-REDACTED]", text)
    text = PII_PATTERNS["email"].sub("[EMAIL-REDACTED]", text)
    text = PII_PATTERNS["phone"].sub("[PHONE-REDACTED]", text)
    return text


# ── Input sanitization ───────────────────────────────────────────────────────
def sanitize_query(query: str, max_length: int = 4000) -> tuple[str, Optional[str]]:
    """Returns (sanitized_query, error_message_or_None)"""
    query = query.strip()

    if not query:
        return "", "Query cannot be empty"

    if len(query) > max_length:
        return "", f"Query too long ({len(query)} chars). Max {max_length}."

    if detect_prompt_injection(query):
        return "", "Query contains disallowed patterns"

    pii = detect_pii(query)
    if any(pii.values()):
        query = redact_pii(query)

    return query, None


# ── File validation ──────────────────────────────────────────────────────────
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
}

MAX_FILENAME_LENGTH = 255
DANGEROUS_EXTENSIONS = {".exe", ".sh", ".bat", ".ps1", ".js", ".py", ".php"}


def validate_upload(filename: str, content_type: str, size_bytes: int, max_mb: int = 50) -> Optional[str]:
    from pathlib import Path
    ext = Path(filename).suffix.lower()

    if ext in DANGEROUS_EXTENSIONS:
        return f"File type '{ext}' is not allowed"
    if len(filename) > MAX_FILENAME_LENGTH:
        return "Filename too long"
    if size_bytes > max_mb * 1024 * 1024:
        return f"File too large. Max {max_mb}MB"
    if content_type not in ALLOWED_MIME_TYPES and not content_type.startswith("text/"):
        return f"MIME type '{content_type}' not allowed"
    return None
