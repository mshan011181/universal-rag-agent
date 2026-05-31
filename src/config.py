import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "memory_enterprise.db"
CHROMA_PATH = DATA_DIR / "chroma_db"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")

GROQ_MODEL = "llama-3.3-70b-versatile"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 5
QUALITY_THRESHOLD = 0.65
HIGH_CONFIDENCE = 0.85

for d in [DATA_DIR, UPLOADS_DIR, CHROMA_PATH]:
    d.mkdir(parents=True, exist_ok=True)
