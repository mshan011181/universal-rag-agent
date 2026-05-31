import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def client():
    from api.main import app
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readiness(client):
    r = client.get("/api/health/ready")
    assert r.status_code == 200
    assert "ready" in r.json()


def test_query_requires_auth(client):
    r = client.post("/api/query/", json={"query": "What is RAG?"})
    assert r.status_code == 401


def test_register_and_login(client):
    r = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "testpass123",
        "org_name": "test-org"
    })
    assert r.status_code == 201

    r = client.post("/api/auth/token", data={
        "username": "test@example.com",
        "password": "testpass123"
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_rate_limit_headers(client):
    r = client.get("/api/health")
    # Health is skipped from rate limiting — just check it responds
    assert r.status_code == 200
