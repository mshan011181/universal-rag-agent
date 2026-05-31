import time
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = structlog.get_logger()

SKIP_PATHS = {"/metrics", "/api/health", "/api/docs", "/api/redoc", "/openapi.json"}


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in SKIP_PATHS:
            return await call_next(request)

        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 2)

        logger.info(
            "request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            ip=request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown"),
            request_id=getattr(request.state, "request_id", None),
            user_agent=request.headers.get("User-Agent", "")[:100],
        )
        return response
