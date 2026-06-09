"""
pii_masker.py — Regex-based PII detection and masking for query sanitisation.

Masks common PII patterns before queries are processed or stored:
  - Email addresses   → [EMAIL]
  - Phone numbers     → [PHONE]
  - SSN (US)          → [SSN]
  - Credit card nos.  → [CARD]
  - UK NI numbers     → [NI]
  - IP addresses      → [IP]
  - Aadhaar (India)   → [AADHAAR]
  - Passport-like IDs → [PASSPORT]

Usage:
    from src.security.pii_masker import mask_pii
    result = mask_pii("Call me at 9876543210 or email foo@bar.com")
    # result.masked_query  → "Call me at [PHONE] or email [EMAIL]"
    # result.pii_found     → True
    # result.types_found   → ["PHONE", "EMAIL"]
"""

import re
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Order matters: more-specific patterns first to avoid partial matches
_PATTERNS: list[tuple[str, re.Pattern]] = [
    # SSN must come before generic phone (same digit density)
    ("SSN",      re.compile(r'\b\d{3}[- ]\d{2}[- ]\d{4}\b')),
    # Credit card: 13-16 digits optionally separated by spaces/dashes
    ("CARD",     re.compile(r'\b(?:\d[ \-]?){13,16}\b')),
    # Aadhaar: 12 digits (groups of 4 separated by space/dash)
    ("AADHAAR",  re.compile(r'\b\d{4}[- ]\d{4}[- ]\d{4}\b')),
    # UK NI: AB123456C
    ("NI",       re.compile(r'\b[A-Z]{2}\d{6}[ABCD]\b', re.IGNORECASE)),
    # Passport: 1-2 letters followed by 6-7 digits
    ("PASSPORT", re.compile(r'\b[A-Z]{1,2}\d{6,7}\b')),
    # Email — before phone so foo@bar.com isn't partially matched as PHONE
    ("EMAIL",    re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b')),
    # IP address
    ("IP",       re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')),
    # Phone: international (+XX) or local, 7-15 digits with common separators
    ("PHONE",    re.compile(r'\b(\+?[\d\s\(\)\-\.]{7,17}\d)\b')),
]


@dataclass
class MaskResult:
    masked_query: str
    pii_found: bool
    types_found: list[str] = field(default_factory=list)


def mask_pii(query: str) -> MaskResult:
    """Detect and mask PII in a query string.

    Returns a MaskResult with:
      - masked_query:  original text with PII replaced by [TYPE] placeholders
      - pii_found:     True if any PII was detected
      - types_found:   list of PII type labels found (e.g. ["EMAIL", "PHONE"])
    """
    result = query
    types_found: list[str] = []

    for label, pattern in _PATTERNS:
        new_result, n = pattern.subn(f"[{label}]", result)
        if n > 0:
            result = new_result
            if label not in types_found:
                types_found.append(label)

    if types_found:
        logger.info("PII masked in query — types: %s", types_found)

    return MaskResult(
        masked_query=result,
        pii_found=bool(types_found),
        types_found=types_found,
    )
