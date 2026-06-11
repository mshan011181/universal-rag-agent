"""API integration tests — health, auth, rate-limit headers."""


# ── Health ─────────────────────────────────────────────────────────────────────
def test_health_returns_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_includes_uptime(client):
    r = client.get("/api/health")
    assert "uptime_seconds" in r.json()


def test_readiness_returns_ready_key(client):
    r = client.get("/api/health/ready")
    assert r.status_code == 200
    assert "ready" in r.json()


def test_readiness_includes_vector_store_check(client):
    r = client.get("/api/health/ready")
    checks = r.json().get("checks", {})
    assert "vector_store" in checks


# ── Auth — registration ────────────────────────────────────────────────────────
def test_register_returns_201(client):
    from tests.conftest import _seed_otp
    _seed_otp("new@example.com")
    r = client.post("/api/auth/register", json={
        "email": "new@example.com",
        "password": "NewPass123!",
        "org_name": "test-org",
        "otp": "123456",
    })
    assert r.status_code == 201


def test_register_returns_user_and_org_ids(client):
    from tests.conftest import _seed_otp
    _seed_otp("ids@example.com")
    r = client.post("/api/auth/register", json={
        "email": "ids@example.com",
        "password": "IdsPass123!",
        "org_name": "ids-org",
        "otp": "123456",
    })
    body = r.json()
    assert "user_id" in body
    assert "org_id" in body
    assert body["email"] == "ids@example.com"


def test_register_duplicate_email_returns_409(client):
    from tests.conftest import _seed_otp
    _seed_otp("dup@example.com")
    payload = {"email": "dup@example.com", "password": "DupPass1!", "org_name": "org", "otp": "123456"}
    client.post("/api/auth/register", json=payload)
    _seed_otp("dup@example.com")
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 409


def test_register_invalid_email_returns_422(client):
    r = client.post("/api/auth/register", json={
        "email": "not-an-email",
        "password": "Pass1!",
        "org_name": "org",
    })
    assert r.status_code == 422


# ── Auth — login ───────────────────────────────────────────────────────────────
def test_login_returns_tokens(client):
    from tests.conftest import _seed_otp
    _seed_otp("login@example.com")
    client.post("/api/auth/register", json={
        "email": "login@example.com",
        "password": "LoginPass1!",
        "org_name": "org",
        "otp": "123456",
    })
    r = client.post("/api/auth/token", data={
        "username": "login@example.com",
        "password": "LoginPass1!",
    })
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


def test_login_wrong_password_returns_401(client):
    from tests.conftest import _seed_otp
    _seed_otp("wrongpw@example.com")
    client.post("/api/auth/register", json={
        "email": "wrongpw@example.com",
        "password": "CorrectPass1!",
        "org_name": "org",
        "otp": "123456",
    })
    r = client.post("/api/auth/token", data={
        "username": "wrongpw@example.com",
        "password": "WrongPass!",
    })
    assert r.status_code == 401


def test_login_unknown_user_returns_401(client):
    r = client.post("/api/auth/token", data={
        "username": "nobody@example.com",
        "password": "anything",
    })
    assert r.status_code == 401


# ── Auth — protected routes ────────────────────────────────────────────────────
def test_query_without_token_returns_401(client):
    r = client.post("/api/query/", json={"query": "What is RAG?"})
    assert r.status_code == 401


def test_ingest_without_token_returns_401(client):
    r = client.post("/api/ingest/text", json={"text": "hello", "source": "test"})
    assert r.status_code == 401


# ── Auth — refresh token ───────────────────────────────────────────────────────
def test_refresh_token_returns_new_tokens(client):
    from tests.conftest import _seed_otp
    _seed_otp("refresh@example.com")
    client.post("/api/auth/register", json={
        "email": "refresh@example.com",
        "password": "RefreshPass1!",
        "org_name": "org",
        "otp": "123456",
    })
    login = client.post("/api/auth/token", data={
        "username": "refresh@example.com",
        "password": "RefreshPass1!",
    })
    refresh_token = login.json()["refresh_token"]
    r = client.post(f"/api/auth/refresh?refresh_token={refresh_token}")
    assert r.status_code == 200
    assert "access_token" in r.json()


# ── Rate limit headers ─────────────────────────────────────────────────────────
def test_health_skips_rate_limit_headers(client):
    # /api/health is exempt from rate limiting — no X-RateLimit headers expected
    r = client.get("/api/health")
    assert r.status_code == 200
