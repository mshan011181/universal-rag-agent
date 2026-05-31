import time
from fastapi import APIRouter
from src.retrieval.vector_store import collection_count

router = APIRouter()
_start_time = time.time()


@router.get("/health")
async def health():
    return {"status": "ok", "uptime_seconds": round(time.time() - _start_time)}


@router.get("/health/ready")
async def readiness():
    checks = {}
    try:
        checks["vector_store"] = {"status": "ok", "chunks": collection_count()}
    except Exception as e:
        checks["vector_store"] = {"status": "error", "detail": str(e)}

    all_ok = all(v.get("status") == "ok" for v in checks.values())
    return {"ready": all_ok, "checks": checks}
