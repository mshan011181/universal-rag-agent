import os
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Limits per minute per user/IP
RATE_LIMITS = {
    "/api/query": 30,
    "/api/ingest": 10,
    "/api/auth": 20,
    "default": 100,
}

_buckets: dict = {}  # In production: use Redis


def _get_key(request: Request) -> str:
    # Use user ID if authenticated, else IP
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0] if forwarded else request.client.host
    return f"{ip}:{request.url.path.split('/')[2] if len(request.url.path.split('/')) > 2 else 'root'}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ["/api/health", "/metrics"]:
            return await call_next(request)

        key = _get_key(request)
        now = int(time.time() // 60)  # 1-minute window
        bucket_key = f"{key}:{now}"

        limit = RATE_LIMITS.get(
            "/" + "/".join(request.url.path.split("/")[:3]),
            RATE_LIMITS["default"]
        )

        count = _buckets.get(bucket_key, 0) + 1
        _buckets[bucket_key] = count

        # Cleanup old buckets periodically
        if len(_buckets) > 10000:
            old = int(time.time() // 60) - 2
            _buckets.clear()

        if count > limit:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Max {limit} requests/minute."},
                headers={"Retry-After": "60", "X-RateLimit-Limit": str(limit)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - count))
        return response
