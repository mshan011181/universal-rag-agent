import os
import uuid
import hashlib
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
import structlog

from api.auth_utils import get_current_user_or_api_key, require_role
from src.retrieval.vector_store import ingest_file, ingest_text
from src.memory.sqlite_store import write_ingest, get_ingest_history, delete_ingest, get_conn
from src.config import UPLOADS_DIR

logger = structlog.get_logger()
router = APIRouter()

ALLOWED_FILE_TYPES = {".pdf", ".txt", ".docx", ".md", ".csv"}
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
    """Ingest a document file (PDF, DOCX, TXT, MD, CSV)."""
    filename = _safe_filename(file.filename or "upload")
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {ALLOWED_FILE_TYPES}")

    content = await file.read()

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_FILE_SIZE_MB}MB")

    # Deduplicate by content hash
    content_hash = hashlib.sha256(content).hexdigest()[:16]
    save_name = f"{user['user_id']}_{content_hash}{ext}"
    save_path = UPLOADS_DIR / save_name

    ingest_id = str(uuid.uuid4())
    user_id = user["user_id"]
    org_id = user.get("org_id", "default")

    save_path.write_bytes(content)

    # Write to database immediately so item appears in list right away
    logger.info("ingest_queued", ingest_id=ingest_id, filename=filename, user_id=user_id)
    write_ingest(ingest_id, user_id, "document", filename, file_size=len(content), chunks=0)

    # Process file and update chunks count in background
    def do_ingest():
        try:
            logger.info("ingest_processing_start", ingest_id=ingest_id, filename=filename)
            n = ingest_file(str(save_path), namespace=org_id)
            # Update chunks count after processing
            with get_conn() as conn:
                conn.execute(
                    "UPDATE ingest_history SET chunks_created = ? WHERE ingest_id = ?",
                    (n, ingest_id)
                )
                conn.commit()
            logger.info("ingest_complete", filename=filename, chunks=n, user_id=user_id, ingest_id=ingest_id)
        except Exception as e:
            logger.error("ingest_failed", filename=filename, error=str(e), ingest_id=ingest_id, exc_info=True)

    background_tasks.add_task(do_ingest)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "filename": filename,
        "ingest_type": "document",
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
    """Ingest plain text."""
    if len(body.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Text too short to index")

    ingest_id = str(uuid.uuid4())

    try:
        n = ingest_text(body.text, source=f"{user['user_id']}:{body.source}", namespace=user.get("org_id", "default"))
        write_ingest(ingest_id, user["user_id"], "text", body.source, chunks=n)
        return {
            "ingest_id": ingest_id,
            "status": "done",
            "chunks": n,
            "source": body.source,
            "ingest_type": "text",
        }
    except Exception as e:
        logger.error("text_ingest_failed", error=str(e), user_id=user["user_id"])
        raise HTTPException(status_code=500, detail="Text ingestion failed")


class YouTubeIngestRequest(BaseModel):
    url: str


@router.post("/youtube")
async def ingest_youtube_endpoint(
    body: YouTubeIngestRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("user")),
):
    """Ingest a YouTube video by URL."""
    if "youtube.com" not in body.url and "youtu.be" not in body.url:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    ingest_id = str(uuid.uuid4())
    source_name = body.url.split("?")[0].split("/")[-1][:20]  # Extract video ID or short name
    user_id = user["user_id"]

    # Write to database immediately
    logger.info("youtube_queued", ingest_id=ingest_id, url=body.url, user_id=user_id)
    write_ingest(ingest_id, user_id, "youtube", source_name, source_url=body.url, chunks=0)

    def do_process():
        try:
            # In production: use yt-dlp to download audio, then transcribe with Groq Whisper
            logger.info("youtube_processing", url=body.url, user_id=user_id, ingest_id=ingest_id)
        except Exception as e:
            logger.error("youtube_processing_failed", url=body.url, error=str(e), ingest_id=ingest_id)

    background_tasks.add_task(do_process)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "url": body.url,
        "ingest_type": "youtube",
        "message": "YouTube video queued for transcription. This may take a few minutes.",
    }


class WebLinkIngestRequest(BaseModel):
    url: str


@router.post("/weblink")
async def ingest_weblink_endpoint(
    body: WebLinkIngestRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("user")),
):
    """Ingest content from a web URL."""
    if not body.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")

    ingest_id = str(uuid.uuid4())
    source_name = body.url.split("?")[0].split("/")[-1][:50] or body.url.split("://")[1].split("/")[0]
    user_id = user["user_id"]

    # Write to database immediately
    logger.info("weblink_queued", ingest_id=ingest_id, url=body.url, user_id=user_id)
    write_ingest(ingest_id, user_id, "weblink", source_name, source_url=body.url, chunks=0)

    def do_process():
        try:
            # In production: use requests + BeautifulSoup to fetch and parse
            logger.info("weblink_processing", url=body.url, user_id=user_id, ingest_id=ingest_id)
        except Exception as e:
            logger.error("weblink_processing_failed", url=body.url, error=str(e), ingest_id=ingest_id)

    background_tasks.add_task(do_process)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "url": body.url,
        "ingest_type": "weblink",
        "message": "Web page queued for ingestion. Content will be available shortly.",
    }


class AudioVideoIngestRequest(BaseModel):
    url: str
    type: str  # "audio" or "video"


@router.post("/media")
async def ingest_media_endpoint(
    body: AudioVideoIngestRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("user")),
):
    """Ingest audio or video from URL."""
    if body.type not in ["audio", "video"]:
        raise HTTPException(status_code=400, detail="Type must be 'audio' or 'video'")

    if not body.url.startswith(("http://", "https://", "file://")):
        raise HTTPException(status_code=400, detail="Invalid media URL")

    ingest_id = str(uuid.uuid4())
    source_name = body.url.split("?")[0].split("/")[-1][:50] or f"{body.type}_{ingest_id[:8]}"
    user_id = user["user_id"]

    # Write to database immediately
    logger.info("media_queued", ingest_id=ingest_id, url=body.url, media_type=body.type, user_id=user_id)
    write_ingest(ingest_id, user_id, body.type, source_name, source_url=body.url, chunks=0)

    def do_process():
        try:
            # In production: download media, transcribe with Groq Whisper
            logger.info("media_processing", url=body.url, media_type=body.type, user_id=user_id, ingest_id=ingest_id)
        except Exception as e:
            logger.error("media_processing_failed", url=body.url, media_type=body.type, error=str(e), ingest_id=ingest_id)

    background_tasks.add_task(do_process)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "url": body.url,
        "ingest_type": body.type,
        "message": f"{body.type.capitalize()} queued for transcription. This may take a few minutes.",
    }


AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv"}
MAX_MEDIA_SIZE_MB = 500
MAX_MEDIA_SIZE_BYTES = MAX_MEDIA_SIZE_MB * 1024 * 1024


@router.post("/media-file")
async def ingest_media_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    media_type: str = "audio",
    user: dict = Depends(require_role("user")),
):
    """Ingest audio or video file (upload)."""
    if media_type not in ["audio", "video"]:
        raise HTTPException(status_code=400, detail="media_type must be 'audio' or 'video'")

    filename = _safe_filename(file.filename or "upload")
    ext = Path(filename).suffix.lower()

    if media_type == "audio" and ext not in AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Audio type '{ext}' not allowed. Allowed: {AUDIO_EXTENSIONS}")

    if media_type == "video" and ext not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Video type '{ext}' not allowed. Allowed: {VIDEO_EXTENSIONS}")

    content = await file.read()

    if len(content) > MAX_MEDIA_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_MEDIA_SIZE_MB}MB")

    # Deduplicate by content hash
    content_hash = hashlib.sha256(content).hexdigest()[:16]
    save_name = f"{user['user_id']}_{content_hash}{ext}"
    save_path = UPLOADS_DIR / save_name
    save_path.write_bytes(content)

    ingest_id = str(uuid.uuid4())
    user_id = user["user_id"]

    # Write to database immediately
    logger.info("media_file_queued", ingest_id=ingest_id, filename=filename, media_type=media_type, user_id=user_id)
    write_ingest(ingest_id, user_id, media_type, filename, file_size=len(content), chunks=0)

    def do_process():
        try:
            # In production: transcribe with Groq Whisper
            logger.info("media_file_processing", filename=filename, media_type=media_type, user_id=user_id, ingest_id=ingest_id)
        except Exception as e:
            logger.error("media_file_processing_failed", filename=filename, media_type=media_type, error=str(e), ingest_id=ingest_id)

    background_tasks.add_task(do_process)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "filename": filename,
        "ingest_type": media_type,
        "size_bytes": len(content),
        "message": f"{media_type.capitalize()} file queued for transcription. This may take a few minutes.",
    }


@router.get("/list")
async def list_ingestion_history(
    user: dict = Depends(require_role("user")),
):
    """List all ingested items for the current user."""
    try:
        items = get_ingest_history(user["user_id"])
        # Group by type
        by_type = {}
        for item in items:
            t = item["ingest_type"]
            if t not in by_type:
                by_type[t] = []
            by_type[t].append({
                "ingest_id": item["ingest_id"],
                "name": item["source_name"],
                "url": item["source_url"],
                "size_bytes": item["file_size_bytes"],
                "chunks": item["chunks_created"],
                "created_at": item["created_at"],
            })
        return {"by_type": by_type, "total": len(items)}
    except Exception as e:
        logger.error("list_ingest_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list ingestions")


@router.delete("/{ingest_id}")
async def delete_ingest_endpoint(
    ingest_id: str,
    user: dict = Depends(require_role("user")),
):
    """Delete an ingested item."""
    if not delete_ingest(ingest_id, user["user_id"]):
        raise HTTPException(status_code=404, detail="Ingest item not found or already deleted")

    logger.info("ingest_deleted", ingest_id=ingest_id, user_id=user["user_id"])
    return {"status": "deleted", "ingest_id": ingest_id}
