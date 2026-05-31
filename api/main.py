import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
import structlog

from api.routers import auth, query, ingest, admin, health
from api.middleware.rate_limit import RateLimitMiddleware
from api.middleware.audit import AuditMiddleware
from src.memory.sqlite_store import init_db

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", service="universal-rag-agent")
    init_db()
    yield
    logger.info("shutdown", service="universal-rag-agent")


app = FastAPI(
    title="Universal RAG Agent API",
    version="1.0.0",
    description="Production-grade Universal RAG Agent with 14 patterns",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Middleware (order matters — outermost first)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AuditMiddleware)

# Request ID injection
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    start = time.time()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = str(round((time.time() - start) * 1000, 2)) + "ms"
    return response

# Prometheus metrics
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(query.router, prefix="/api/query", tags=["Query"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["Ingestion"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
