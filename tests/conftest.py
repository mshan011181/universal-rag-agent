"""
Shared test fixtures.

All external services (Pinecone, Redis, LLM) are mocked — tests run with zero
network calls and no credentials required.
"""

import os
import pytest

# Set env before any app imports so config.py picks them up
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("PINECONE_API_KEY", "test-pinecone-key")
os.environ.setdefault("PINECONE_INDEX_NAME", "test-index")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-ci-only")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("LLM_PROVIDER", "groq")

from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


# ── LLM mock ──────────────────────────────────────────────────────────────────
LLM_JSON_RESPONSE = (
    '{"ambiguity": "low", "complexity": "simple", "data_type": "text", '
    '"domain_risk": false, "has_multi_angles": false, "query_class": "factual", '
    '"relevance": 0.9, "completeness": 0.8, "hallucination_risk": 0.1, '
    '"reasoning": "test", "citation_map": {}, "all_supported": true}'
)


@pytest.fixture(autouse=True)
def mock_llm():
    mock = MagicMock()
    mock.invoke.return_value = MagicMock(content=LLM_JSON_RESPONSE)
    with patch("src.generation.llm.get_llm", return_value=mock):
        yield mock


# ── Pinecone mock ──────────────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def mock_pinecone():
    mock_index = MagicMock()
    mock_index.query.return_value = {
        "matches": [{
            "id": "doc_0",
            "score": 0.92,
            "metadata": {"content": "Test chunk content.", "source": "test.pdf", "chunk_idx": 0},
        }]
    }
    mock_index.upsert.return_value = {"upserted_count": 1}
    mock_index.describe_index_stats.return_value = {
        "namespaces": {"default": {"vector_count": 42}},
        "total_vector_count": 42,
        "dimension": 384,
    }

    mock_pc = MagicMock()
    mock_pc.Index.return_value = mock_index
    mock_pc.list_indexes.return_value = [MagicMock(name="test-index")]
    mock_pc.describe_index.return_value = MagicMock(status={"ready": True})

    import numpy as np
    mock_embedder = MagicMock()
    mock_embedder.encode.return_value = np.array([[0.1] * 384])

    import src.retrieval.vector_store as vs
    with patch("src.retrieval.vector_store.Pinecone", return_value=mock_pc), \
         patch("src.retrieval.vector_store.SentenceTransformer", return_value=mock_embedder):
        vs._index = None
        vs._pc = None
        vs._embedder = None
        yield mock_index
        vs._index = None
        vs._pc = None
        vs._embedder = None


# ── Redis mock ─────────────────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def mock_redis():
    mock_r = AsyncMock()
    mock_r.incr.return_value = 1
    mock_r.expire.return_value = True
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_r):
        yield mock_r


# ── FastAPI sync test client ───────────────────────────────────────────────────
@pytest.fixture
def client():
    from api.main import app
    return TestClient(app)


def _seed_otp(email: str, otp: str = "123456") -> None:
    """Insert a valid registration OTP directly into the DB for tests."""
    from datetime import datetime, timedelta
    from src.memory.sqlite_store import get_conn
    expires = (datetime.utcnow() + timedelta(minutes=10)).isoformat()
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS email_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            purpose TEXT NOT NULL,
            token TEXT,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.execute(
        "INSERT INTO email_otps (email, otp, purpose, expires_at) VALUES (?,?,?,?)",
        (email.lower(), otp, "register", expires),
    )
    conn.commit()
    conn.close()


# ── Authenticated client fixture ───────────────────────────────────────────────
@pytest.fixture
def auth_client(client):
    _seed_otp("fixture@example.com")
    client.post("/api/auth/register", json={
        "email": "fixture@example.com",
        "password": "FixturePass1!",
        "org_name": "fixture-org",
        "otp": "123456",
    })
    resp = client.post("/api/auth/token", data={
        "username": "fixture@example.com",
        "password": "FixturePass1!",
    })
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
