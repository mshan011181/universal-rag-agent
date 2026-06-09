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

# Email / SMTP — used for OTP delivery (registration + password reset)
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")          # sender Gmail / SMTP address
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")      # app password (Gmail: 16-char)
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER)   # display From address
APP_BASE_URL  = os.getenv("APP_BASE_URL", "http://localhost:3000")

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 15
QUALITY_THRESHOLD = 0.65
HIGH_CONFIDENCE = 0.85

for d in [DATA_DIR, UPLOADS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
