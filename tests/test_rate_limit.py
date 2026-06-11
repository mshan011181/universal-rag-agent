"""
Tests for the Redis-backed rate limiter middleware.

The Redis client is mocked by conftest.py (mock_redis fixture).
"""

from unittest.mock import patch


def test_request_below_limit_passes(client):
    """First request on a clean bucket is always allowed."""
    r = client.get("/api/health")
    assert r.status_code == 200


def test_rate_limit_exceeded_returns_429(client, mock_redis):
    """When Redis returns a count above the limit the middleware must return 429."""
    mock_redis.incr.return_value = 999  # way over any limit

    # Patch _get_redis directly on the already-imported middleware module
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_redis):
        r = client.post("/api/auth/token", data={
            "username": "nobody@example.com",
            "password": "anything",
        })
    assert r.status_code == 429


def test_rate_limit_retry_after_header(client, mock_redis):
    mock_redis.incr.return_value = 999
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_redis):
        r = client.post("/api/auth/token", data={"username": "x", "password": "y"})
    assert r.headers.get("Retry-After") == "60"


def test_rate_limit_header_present_on_allowed_request(client, mock_redis):
    mock_redis.incr.return_value = 1
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_redis):
        r = client.post("/api/auth/token", data={"username": "x", "password": "y"})
    # Request passes (count=1 <= limit), headers should be present
    assert "X-RateLimit-Limit" in r.headers
    assert "X-RateLimit-Remaining" in r.headers


def test_rate_limit_remaining_decrements(client, mock_redis):
    mock_redis.incr.return_value = 5
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_redis):
        r = client.post("/api/auth/token", data={"username": "x", "password": "y"})
    limit = int(r.headers["X-RateLimit-Limit"])
    remaining = int(r.headers["X-RateLimit-Remaining"])
    assert remaining == max(0, limit - 5)


def test_redis_failure_fails_open(client, mock_redis):
    """If Redis raises, the middleware must let the request through (fail open)."""
    mock_redis.incr.side_effect = Exception("Redis connection refused")
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_redis):
        r = client.get("/api/health")
    assert r.status_code == 200


def test_health_endpoint_skips_rate_limit(client, mock_redis):
    """Health check must never be blocked regardless of Redis count."""
    mock_redis.incr.return_value = 99999
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_redis):
        r = client.get("/api/health")
    assert r.status_code == 200


def test_redis_expire_called_on_new_bucket(client, mock_redis):
    """On the first request in a window (incr returns 1), expire must be set."""
    mock_redis.incr.return_value = 1
    with patch("api.middleware.rate_limit._get_redis", return_value=mock_redis):
        client.post("/api/auth/token", data={"username": "x", "password": "y"})
    mock_redis.expire.assert_awaited_once()
