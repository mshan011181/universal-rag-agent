import os
import uuid
import hashlib
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
import structlog

from api.auth_utils import get_current_user_or_api_key, require_role
from src.retrieval.vector_store import ingest_file, ingest_text
from src.config import UPLOADS_DIR

logger = structlog.get_logger()
router = APIRouter()

ALLOWED_TYPES = {".pdf", ".txt", ".docx", ".md"}
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


def _safe_filename(filename: str) -> str:
    return Path(filename).name.replace("..", "").replace("/", "").replace("\\", "")


@router.post("/file")
async def ingest_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(require_role("user")),
):
    filename = _safe_filename(file.filename or "upload")
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {ALLOWED_TYPES}")

    content = await file.read()

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_FILE_SIZE_MB}MB")

    # Deduplicate by content hash
    content_hash = hashlib.sha256(content).hexdigest()[:16]
    save_name = f"{user['user_id']}_{content_hash}{ext}"
    save_path = UPLOADS_DIR / save_name

    save_path.write_bytes(content)

    # Ingest in background to avoid blocking the response
    def do_ingest():
        try:
            n = ingest_file(str(save_path))
            logger.info("ingest_complete", filename=filename, chunks=n, user_id=user["user_id"])
        except Exception as e:
            logger.error("ingest_failed", filename=filename, error=str(e))

    background_tasks.add_task(do_ingest)

    return {
        "status": "processing",
        "filename": filename,
        "size_bytes": len(content),
        "message": "File queued for ingestion. Chunks will be available shortly.",
    }


class TextIngestRequest(BaseModel):
    text: str
    source: str = "manual"


@router.post("/text")
async def ingest_text_endpoint(
    body: TextIngestRequest,
    user: dict = Depends(require_role("user")),
):
    if len(body.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Text too short to index")

    try:
        n = ingest_text(body.text, source=f"{user['user_id']}:{body.source}")
        return {"status": "done", "chunks": n, "source": body.source}
    except Exception as e:
        logger.error("text_ingest_failed", error=str(e), user_id=user["user_id"])
        raise HTTPException(status_code=500, detail="Text ingestion failed")
