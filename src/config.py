import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "memory_enterprise.db"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")

# Pinecone — managed vector DB (replaces self-hosted ChromaDB)
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "universal-rag")

# Anthropic Claude — direct API (recommended for production enterprise)
# LLM_PROVIDER=anthropic  →  uses this key + model
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")

# Vertex AI Claude — production LLM on Cloud Run (ADC, no API key required)
# LLM_PROVIDER=vertexai  →  uses ADC from the Cloud Run service account
VERTEXAI_PROJECT = os.getenv("VERTEXAI_PROJECT", "")
VERTEXAI_LOCATION = os.getenv("VERTEXAI_LOCATION", "us-east5")
VERTEXAI_MODEL = os.getenv("VERTEXAI_MODEL", "claude-sonnet-4-5@20251205")

# LangSmith — observability / tracing for all LLM providers in production
# Set LANGCHAIN_TRACING_V2=true to enable; all LangChain calls are traced automatically.
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY", "")
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "universal-rag-enterprise")
LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")

GROQ_MODEL = "llama-3.3-70b-versatile"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # dimension for all-MiniLM-L6-v2; must match Pinecone index config

# Email — Resend API for OTP delivery (registration + password reset)
# Sign up free at https://resend.com → API Keys → create key
# Free tier: 3000 emails/month, 100/day — no domain required for testing
RESEND_API_KEY  = os.getenv("RESEND_API_KEY", "")
# Sender address: use onboarding@resend.dev for free testing,
# or your verified domain once you add one in Resend dashboard
EMAIL_FROM      = os.getenv("EMAIL_FROM", "onboarding@resend.dev")
APP_BASE_URL    = os.getenv("APP_BASE_URL", "http://localhost:3000")

# ── SSO / OIDC ─────────────────────────────────────────────────────────────────
# Azure AD (Entra ID) — covers Active Directory / Microsoft 365
# Register app at: https://portal.azure.com → App registrations
# Redirect URI to add there: {API_BASE_URL}/api/auth/sso/azure/callback
SSO_AZURE_CLIENT_ID     = os.getenv("SSO_AZURE_CLIENT_ID", "")
SSO_AZURE_CLIENT_SECRET = os.getenv("SSO_AZURE_CLIENT_SECRET", "")
SSO_AZURE_TENANT_ID     = os.getenv("SSO_AZURE_TENANT_ID", "common")  # 'common' = any tenant

# Google Workspace / Gmail SSO
# Register at: https://console.cloud.google.com → APIs & Services → Credentials
# Redirect URI to add there: {API_BASE_URL}/api/auth/sso/google/callback
SSO_GOOGLE_CLIENT_ID     = os.getenv("SSO_GOOGLE_CLIENT_ID", "")
SSO_GOOGLE_CLIENT_SECRET = os.getenv("SSO_GOOGLE_CLIENT_SECRET", "")

# API_BASE_URL — backend base URL used as the SSO redirect_uri host
# In dev: http://localhost:8000 | In prod: https://api.yourdomain.com
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# ── OCR configuration ──────────────────────────────────────────────────────────
# Windows: install Tesseract from https://github.com/UB-Mannheim/tesseract/wiki
#          install Poppler   from https://github.com/oschwartz10612/poppler-windows/releases
# Linux:   apt install tesseract-ocr poppler-utils
# Leave blank to auto-detect from PATH.
TESSERACT_CMD  = os.getenv("TESSERACT_CMD", "")   # e.g. C:\Program Files\Tesseract-OCR\tesseract.exe
POPPLER_PATH   = os.getenv("POPPLER_PATH",  "")   # e.g. C:\Program Files\poppler\Library\bin

# Apply tesseract path at import time if provided
if TESSERACT_CMD:
    try:
        import pytesseract as _pt
        _pt.pytesseract.tesseract_cmd = TESSERACT_CMD
    except Exception:
        pass

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 15

# Per-document-type chunk sizes
# Smaller chunks for tabular/structured data → better cell-level precision
# Larger chunks for narrative text → better context preservation
CHUNK_SIZES: dict[str, tuple[int, int]] = {
    "narrative":  (1000, 200),   # PDF, DOCX, TXT, MD, PPTX
    "tabular":    (400,  50),    # XLSX, XLS, CSV
    "code":       (600,  100),   # JSON, code files
}
QUALITY_THRESHOLD = 0.65
HIGH_CONFIDENCE = 0.85

for d in [DATA_DIR, UPLOADS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
