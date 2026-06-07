import os
import time
import collections
import redis.asyncio as aioredis
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

_redis: aioredis.Redis | None = None
_redis_available: bool | None = None  # None = not yet checked

# In-memory fallback rate limiter (used when Redis is unavailable)
_mem_counters: dict = collections.defaultdict(int)
_mem_window: int = 0


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _redis = aioredis.from_url(url, socket_connect_timeout=0.5, decode_responses=True)
    return _redis


def _get_key(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0] if forwarded else request.client.host
    return f"{ip}:{request.url.path.split('/')[2] if len(request.url.path.split('/')) > 2 else 'root'}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ["/api/health", "/metrics"]:
            return await call_next(request)

        key = _get_key(request)
        now = int(time.time() // 60)  # 1-minute window
        bucket_key = f"rate:{key}:{now}"

        limit = RATE_LIMITS.get(
            "/" + "/".join(request.url.path.split("/")[:3]),
            RATE_LIMITS["default"],
        )

        count = 1
        global _redis_available, _mem_counters, _mem_window

        # Reset in-memory counters on new minute window
        if now != _mem_window:
            _mem_counters = collections.defaultdict(int)
            _mem_window = now

        if _redis_available is not False:
            try:
                r = _get_redis()
                count = await r.incr(bucket_key)
                if count == 1:
                    await r.expire(bucket_key, 120)
                _redis_available = True
            except Exception:
                # Redis unavailable — use in-memory fallback immediately, no retry delay
                _redis_available = False
                _mem_counters[bucket_key] += 1
                count = _mem_counters[bucket_key]
        else:
            # Redis known unavailable — use in-memory counter directly
            _mem_counters[bucket_key] += 1
            count = _mem_counters[bucket_key]

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
