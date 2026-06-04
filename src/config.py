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

# Vertex AI Claude — production LLM on Cloud Run (ADC, no API key required)
VERTEXAI_PROJECT = os.getenv("VERTEXAI_PROJECT", "")
VERTEXAI_LOCATION = os.getenv("VERTEXAI_LOCATION", "us-east5")
VERTEXAI_MODEL = os.getenv("VERTEXAI_MODEL", "claude-sonnet-4-5@20251205")

GROQ_MODEL = "llama-3.3-70b-versatile"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # dimension for all-MiniLM-L6-v2; must match Pinecone index config

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 5
QUALITY_THRESHOLD = 0.65
HIGH_CONFIDENCE = 0.85

for d in [DATA_DIR, UPLOADS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
