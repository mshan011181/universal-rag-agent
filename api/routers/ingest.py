import uuid
import hashlib
import urllib.request
import json as _json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
import structlog


def _html_table_to_text(table) -> list[str]:
    """Convert a BeautifulSoup <table> element to header-enriched text rows.

    For each data row, column headers are embedded so that values stay
    semantically linked to their labels even after chunking.

    Example output:
        Competition | Test | ODI | FC | LA          ← raw header row
        Batting average: Test=53.78 | ODI=44.83 | FC=57.84 | LA=45.54
        Matches: Test=200 | ODI=463 | FC=310 | LA=551
    """
    rows_text = []
    headers: list[str] = []

    for tr in table.find_all("tr"):
        th_cells = tr.find_all("th")
        td_cells = tr.find_all("td")

        if th_cells and not td_cells:
            # Pure header row — capture and emit as-is
            headers = [th.get_text(" ", strip=True) for th in th_cells]
            rows_text.append(" | ".join(headers))
        else:
            # Data row (may also have leading <th> as row label)
            all_cells = tr.find_all(["th", "td"])
            cell_texts = [c.get_text(" ", strip=True) for c in all_cells]
            if not any(cell_texts):
                continue

            if headers and len(headers) > 1 and len(cell_texts) == len(headers):
                # Emit plain pipe (legacy) AND enriched (header-labelled) so both
                # raw-value and column-label queries hit the same data.
                row_label = cell_texts[0]
                enriched = [f"{headers[i]}={cell_texts[i]}" for i in range(1, len(cell_texts))]
                rows_text.append(" | ".join(cell_texts))
                rows_text.append(f"{row_label}: {' | '.join(enriched)}")
            else:
                # No matching header — plain pipe join
                rows_text.append(" | ".join(cell_texts))

    return rows_text


def _youtube_title(url: str) -> str:
    """Fetch video title via YouTube oEmbed API (no API key needed)."""
    try:
        oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(url, safe='')}&format=json"
        with urllib.request.urlopen(oembed_url, timeout=5) as r:  # nosec B310
            data = _json.loads(r.read())
            return data.get("title", "")[:120]
    except Exception:
        return ""


import urllib.parse

from api.auth_utils import require_role
from src.retrieval.vector_store import ingest_file, ingest_text, delete_by_source
from src.memory.sqlite_store import write_ingest, get_ingest_history, delete_ingest, delete_cache_by_source, get_conn, write_audit, set_ingest_progress
from src.config import UPLOADS_DIR

logger = structlog.get_logger()
router = APIRouter()

ALLOWED_FILE_TYPES = {
    ".pdf", ".txt", ".docx", ".doc", ".md", ".csv",   # existing
    ".pptx", ".ppt",                                   # PowerPoint
    ".xlsx", ".xls", ".xlsm",                          # Excel
    ".json", ".geojson", ".gjson",                     # JSON / GeoJSON
}
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
    # Store the actual saved file path in source_url so BI RAG can locate it later
    write_ingest(ingest_id, user_id, "document", filename, source_url=str(save_path), file_size=len(content), chunks=0)
    logger.info("ingest_written_to_db", ingest_id=ingest_id, user_id=user_id)

    # Process file and update status + chunks count in background
    def do_ingest():
        def _set_status(status: str, chunks: int = 0):
            with get_conn() as c:
                c.execute(
                    "UPDATE ingest_history SET status=?, chunks_created=? WHERE ingest_id=?",
                    (status, chunks, ingest_id),
                )
                c.commit()

        try:
            logger.info("ingest_processing_start", ingest_id=ingest_id, filename=filename)
            def _on_progress(pct: int, label: str):
                set_ingest_progress(ingest_id, pct, label)
            n = ingest_file(str(save_path), namespace=org_id, source_name=filename, on_progress=_on_progress)
            set_ingest_progress(ingest_id, 100, "Done")
            _set_status("done", n)
            logger.info("ingest_complete", filename=filename, chunks=n, user_id=user_id, ingest_id=ingest_id)
            write_audit("ingest", user_id=user_id, org_id=org_id,
                        detail={"source_name": filename, "ingest_type": "document",
                                "chunks": n, "ingest_id": ingest_id})
        except Exception as e:
            logger.error("ingest_failed", filename=filename, error=str(e), ingest_id=ingest_id, exc_info=True)
            _set_status("failed", 0)
            write_audit("ingest", user_id=user_id, org_id=org_id, status="failure",
                        detail={"source_name": filename, "error": str(e)[:200]})

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
        write_ingest(ingest_id, user["user_id"], "text", body.source, chunks=n, status='done')
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
    user_id = user["user_id"]

    # Fetch actual video title from oEmbed; fall back to video ID
    title = _youtube_title(body.url)
    if not title:
        # Extract video ID from URL as fallback
        import re
        vid_match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", body.url)
        title = vid_match.group(1) if vid_match else body.url.split("/")[-1][:30]
    source_name = title

    # Write to database immediately
    logger.info("youtube_queued", ingest_id=ingest_id, url=body.url, user_id=user_id)
    write_ingest(ingest_id, user_id, "youtube", source_name, source_url=body.url, chunks=0)

    org_id = user.get("org_id", "default")

    def do_process():
        import re as _re
        import tempfile as _tempfile
        import pathlib as _pathlib
        from src.memory.sqlite_store import get_conn as _get_conn

        def _set_status(status: str, chunks: int = 0):
            with _get_conn() as c:
                c.execute(
                    "UPDATE ingest_history SET status=?, chunks_created=? WHERE ingest_id=?",
                    (status, chunks, ingest_id),
                )
                c.commit()

        tmp_dir = _tempfile.mkdtemp()
        try:
            logger.info("youtube_processing", url=body.url, user_id=user_id, ingest_id=ingest_id)

            # ── Step 1: extract video ID ──────────────────────────────────────
            vid_match = _re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", body.url)
            if not vid_match:
                raise ValueError("Could not extract video ID from URL")
            video_id = vid_match.group(1)

            import yt_dlp as _yt_dlp
            import imageio_ffmpeg as _ffmpeg
            from groq import Groq as _Groq

            ffmpeg_exe = _ffmpeg.get_ffmpeg_exe()

            # ── Step 2: Metadata — description + comments ────────────────────
            description_text = ""
            comments_text = ""
            try:
                info_opts = {
                    "quiet": True,
                    "no_warnings": True,
                    "getcomments": True,
                    "extractor_args": {"youtube": {"max_comments": ["20", "all", "0", "0"]}},
                }
                with _yt_dlp.YoutubeDL(info_opts) as ydl:
                    info = ydl.extract_info(body.url, download=False)

                description_text = (info.get("description") or "").strip()

                raw_comments = info.get("comments") or []
                raw_comments.sort(key=lambda c: c.get("like_count") or 0, reverse=True)
                top_comments = raw_comments[:20]
                if top_comments:
                    lines = []
                    for c in top_comments:
                        author = c.get("author") or "Anonymous"
                        text = (c.get("text") or "").replace("\n", " ").strip()
                        likes = c.get("like_count") or 0
                        if text:
                            lines.append(f"- {author} ({likes} likes): {text}")
                    comments_text = "\n".join(lines)

                logger.info("youtube_metadata_fetched",
                            description_chars=len(description_text),
                            comments=len(top_comments), video_id=video_id)
            except Exception as meta_err:
                logger.warning("youtube_metadata_failed", error=str(meta_err), video_id=video_id)

            # ── Step 3: Whisper via raw audio download (primary) ──────────────
            whisper_text = ""
            try:
                out_template = str(_pathlib.Path(tmp_dir) / "audio.%(ext)s")
                ydl_opts = {
                    "format": "bestaudio[filesize<24M]/bestaudio/best",
                    "outtmpl": out_template,
                    "postprocessors": [{
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "64",
                    }],
                    "ffmpeg_location": ffmpeg_exe,
                    "quiet": True,
                    "no_warnings": True,
                }
                logger.info("youtube_audio_download_start", video_id=video_id)
                with _yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([body.url])

                audio_files = list(_pathlib.Path(tmp_dir).glob("*.mp3"))
                if audio_files:
                    audio_path = audio_files[0]
                    logger.info("youtube_audio_downloaded",
                                size_mb=round(audio_path.stat().st_size / 1024 / 1024, 1),
                                video_id=video_id)
                    groq_client = _Groq()
                    with open(audio_path, "rb") as af:
                        result = groq_client.audio.transcriptions.create(
                            model="whisper-large-v3",
                            file=af,
                            response_format="text",
                        )
                    whisper_text = result.strip() if isinstance(result, str) else result.text.strip()
                    logger.info("youtube_whisper_done", chars=len(whisper_text), video_id=video_id)
            except Exception as whisper_err:
                logger.warning("youtube_whisper_failed", error=str(whisper_err), video_id=video_id)

            # ── Step 4: Captions fallback ─────────────────────────────────────
            caption_text = ""
            try:
                from youtube_transcript_api import YouTubeTranscriptApi
                ytt = YouTubeTranscriptApi()
                transcript_list = ytt.fetch(video_id)
                caption_text = " ".join(seg.text for seg in transcript_list).strip()
                logger.info("youtube_captions_fetched", chars=len(caption_text), video_id=video_id)
            except Exception as cap_err:
                logger.warning("youtube_captions_failed", error=str(cap_err), video_id=video_id)

            # ── Step 5: Video frames + Groq Vision ───────────────────────────
            frames_text = ""
            try:
                import base64 as _base64
                import subprocess as _subprocess

                frames_dir = _pathlib.Path(tmp_dir) / "frames"
                frames_dir.mkdir(exist_ok=True)
                video_path = _pathlib.Path(tmp_dir) / "video.mp4"

                vid_opts = {
                    "format": "worstvideo[ext=mp4]/worst[ext=mp4]/worst",
                    "outtmpl": str(video_path),
                    "ffmpeg_location": ffmpeg_exe,
                    "quiet": True,
                    "no_warnings": True,
                }
                logger.info("youtube_video_download_start", video_id=video_id)
                with _yt_dlp.YoutubeDL(vid_opts) as ydl:
                    ydl.download([body.url])

                # Find downloaded video (extension may vary)
                vid_candidates = list(_pathlib.Path(tmp_dir).glob("video.*"))
                if not vid_candidates:
                    vid_candidates = [f for f in _pathlib.Path(tmp_dir).iterdir()
                                      if f.suffix in {".mp4", ".webm", ".mkv"}]

                if vid_candidates:
                    actual_video = vid_candidates[0]
                    # Extract 1 frame every 60 s, max 8 frames, scale to 640px wide
                    frame_pattern = str(frames_dir / "frame_%03d.jpg")
                    cmd = [
                        ffmpeg_exe, "-y", "-i", str(actual_video),
                        "-vf", "fps=1/60,scale=640:-1",
                        "-frames:v", "8",
                        "-q:v", "5",
                        frame_pattern,
                    ]
                    _subprocess.run(cmd, capture_output=True, timeout=120)

                    frame_files = sorted(frames_dir.glob("frame_*.jpg"))
                    groq_client = _Groq()
                    frame_descriptions = []
                    for i, fp in enumerate(frame_files[:8]):
                        try:
                            b64 = _base64.standard_b64encode(fp.read_bytes()).decode()
                            data_url = f"data:image/jpeg;base64,{b64}"
                            resp = groq_client.chat.completions.create(
                                model="meta-llama/llama-4-scout-17b-16e-instruct",
                                max_tokens=512,
                                messages=[{"role": "user", "content": [
                                    {"type": "image_url", "image_url": {"url": data_url}},
                                    {"type": "text", "text": (
                                        f"Frame {i + 1} from YouTube video '{source_name}'. "
                                        "Describe: any on-screen text, slides, diagrams, charts, "
                                        "demonstrations, or notable visual content. Be concise."
                                    )},
                                ]}],
                            )
                            desc = resp.choices[0].message.content.strip()
                            if desc:
                                frame_descriptions.append(f"Frame {i + 1} (~{i * 60}s): {desc}")
                        except Exception as fe:
                            logger.warning("youtube_frame_vision_failed", frame=i + 1, error=str(fe))

                    if frame_descriptions:
                        frames_text = "\n\n".join(frame_descriptions)
                        logger.info("youtube_frames_done", frames=len(frame_descriptions), video_id=video_id)

            except Exception as frame_err:
                logger.warning("youtube_frames_failed", error=str(frame_err), video_id=video_id)

            # ── Step 6: Validate we have something ───────────────────────────
            if not whisper_text and not caption_text:
                raise ValueError("Both Whisper and captions failed — no transcript available")

            # ── Step 7: Build combined document ──────────────────────────────
            sections = [f"[YouTube] {source_name}"]

            if description_text:
                sections.append("## Video Description")
                sections.append(description_text)

            if whisper_text:
                sections.append("## Audio Transcript (Whisper — high accuracy)")
                sections.append(whisper_text)

            if caption_text and caption_text != whisper_text:
                if not whisper_text or len(caption_text) > len(whisper_text) * 0.2:
                    sections.append("## YouTube Captions")
                    sections.append(caption_text)

            if frames_text:
                sections.append("## Visual Content (Frame Analysis)")
                sections.append(frames_text)

            if comments_text:
                sections.append("## Top Viewer Comments")
                sections.append(comments_text)

            full_doc = "\n\n".join(sections)

            # ── Step 8: Ingest into Pinecone ─────────────────────────────────
            chunks = ingest_text(full_doc, source=f"youtube:{body.url}", namespace=org_id)
            _set_status("done", chunks)

            logger.info(
                "youtube_done",
                ingest_id=ingest_id, chunks=chunks, video_id=video_id,
                whisper_chars=len(whisper_text), caption_chars=len(caption_text),
                description_chars=len(description_text),
                frames=len(frame_descriptions) if frames_text else 0,
                comments=len(comments_text.splitlines()) if comments_text else 0,
            )

        except Exception as e:
            logger.error("youtube_processing_failed", url=body.url, error=str(e), ingest_id=ingest_id)
            _set_status("failed", 0)
        finally:
            import shutil as _shutil
            _shutil.rmtree(tmp_dir, ignore_errors=True)

    background_tasks.add_task(do_process)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "url": body.url,
        "ingest_type": "youtube",
        "message": "YouTube video queued — fetching description, comments, transcribing audio (Whisper), and analysing video frames. This may take 3–5 minutes.",
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
    # Use domain + path as readable name; strip query string
    try:
        parsed = urllib.parse.urlparse(body.url)
        path_part = parsed.path.rstrip("/").split("/")[-1] or parsed.netloc
        source_name = (f"{parsed.netloc}/{path_part}" if path_part and path_part != parsed.netloc else parsed.netloc)[:80]
    except Exception:
        source_name = body.url[:80]
    user_id = user["user_id"]
    org_id = user.get("org_id", "default")

    # Write to database immediately with status='processing'
    logger.info("weblink_queued", ingest_id=ingest_id, url=body.url, user_id=user_id)
    write_ingest(ingest_id, user_id, "weblink", source_name, source_url=body.url, chunks=0)
    with get_conn() as _c:
        _c.execute("UPDATE ingest_history SET status='processing' WHERE ingest_id=?", (ingest_id,))
        _c.commit()

    def do_process():
        from src.memory.sqlite_store import get_conn as _get_conn

        def _set_status(status: str, chunks: int = 0):
            with _get_conn() as c:
                c.execute(
                    "UPDATE ingest_history SET status=?, chunks_created=? WHERE ingest_id=?",
                    (status, chunks, ingest_id),
                )
                c.commit()

        try:
            import requests as _requests
            from bs4 import BeautifulSoup as _BS

            logger.info("weblink_processing", url=body.url, user_id=user_id, ingest_id=ingest_id)

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            }
            resp = _requests.get(body.url, headers=headers, timeout=20, allow_redirects=True)
            resp.raise_for_status()

            soup = _BS(resp.text, "lxml")

            # Remove navigation, scripts, styles, ads
            for tag in soup(["script", "style", "nav", "footer", "header",
                              "aside", "form", "noscript", "iframe"]):
                tag.decompose()

            # Convert HTML tables → header-enriched rows BEFORE get_text()
            # Process innermost tables first (deepest DOM depth) so nested
            # tables (e.g. Wikipedia career-stats inside the infobox) are
            # replaced with plain text before their parent table is processed.
            all_tables = soup.find_all("table")
            all_tables_sorted = sorted(
                all_tables,
                key=lambda t: len(list(t.parents)),
                reverse=True,   # deepest first
            )
            for table in all_tables_sorted:
                # Skip if already detached (replaced as part of a parent table)
                if table.parent is None:
                    continue
                rows_text = _html_table_to_text(table)
                if rows_text:
                    table.replace_with("\n" + "\n".join(rows_text) + "\n")

            # Page title
            page_title = (soup.title.string.strip() if soup.title and soup.title.string else source_name)

            # Main content: prefer <article>, <main>, or fall back to <body>
            main_block = (
                soup.find("article")
                or soup.find("main")
                or soup.find("div", {"id": "content"})
                or soup.find("div", {"class": "mw-parser-output"})   # Wikipedia
                or soup.body
            )
            raw_text = main_block.get_text(separator="\n") if main_block else soup.get_text(separator="\n")

            # Collapse whitespace
            lines = [ln.strip() for ln in raw_text.splitlines()]
            lines = [ln for ln in lines if ln]           # drop blank lines
            # Remove duplicate consecutive lines (nav repeats etc.)
            deduped = []
            prev = None
            for ln in lines:
                if ln != prev:
                    deduped.append(ln)
                prev = ln

            page_text = "\n".join(deduped)

            if len(page_text) < 50:
                raise ValueError("Extracted text too short — page may be JavaScript-rendered or blocked")

            # Cap at ~200k chars to avoid Pinecone overload
            page_text = page_text[:200_000]

            doc_text = f"[Web Page] {page_title}\nURL: {body.url}\n\n{page_text}"
            chunks = ingest_text(doc_text, source=f"weblink:{source_name}", namespace=org_id)
            _set_status("done", chunks)

            logger.info("weblink_done", url=body.url, source=source_name,
                        chars=len(page_text), chunks=chunks, ingest_id=ingest_id)

        except Exception as e:
            logger.error("weblink_processing_failed", url=body.url, error=str(e), ingest_id=ingest_id)
            _set_status("failed", 0)

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


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"}
MAX_IMAGE_SIZE_MB = 20
MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

IMAGE_MIME_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
}


@router.post("/image")
async def ingest_image_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(require_role("user")),
):
    """Ingest an image (PNG, JPG, etc.) — Claude Vision extracts text/diagrams."""
    filename = _safe_filename(file.filename or "upload")
    ext = Path(filename).suffix.lower()

    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Allowed: {sorted(IMAGE_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"Image too large. Max {MAX_IMAGE_SIZE_MB}MB")

    content_hash = hashlib.sha256(content).hexdigest()[:16]
    save_name = f"{user['user_id']}_{content_hash}{ext}"
    save_path = UPLOADS_DIR / save_name
    save_path.write_bytes(content)

    ingest_id = str(uuid.uuid4())
    user_id = user["user_id"]
    org_id = user.get("org_id", "default")

    write_ingest(ingest_id, user_id, "image", filename, file_size=len(content), chunks=0)
    logger.info("image_queued", ingest_id=ingest_id, filename=filename, user_id=user_id)

    def do_process():
        try:
            import base64
            from groq import Groq as _Groq
            from src.memory.sqlite_store import get_conn as _get_conn

            mime = IMAGE_MIME_MAP.get(ext, "image/jpeg")
            b64_data = base64.standard_b64encode(content).decode("utf-8")
            data_url = f"data:{mime};base64,{b64_data}"

            client = _Groq()
            prompt = (
                "You are an expert document analysis assistant specialised in extracting structured "
                "information from images for use in a retrieval-augmented generation (RAG) system.\n\n"
                "Analyse this image thoroughly. Follow these rules:\n\n"
                "1. INVOICES / RECEIPTS — Extract every field explicitly:\n"
                "   - Vendor/supplier name, address, contact\n"
                "   - Invoice number, date, due date, PO number\n"
                "   - Line items as a table: Description | Qty | Unit Price | Amount\n"
                "   - Subtotal, tax (rate and amount), discounts, TOTAL amount\n"
                "   - Payment terms, bank details if present\n\n"
                "2. TABLES / SPREADSHEETS / EXCEL SCREENSHOTS — Reproduce the full table:\n"
                "   - Use pipe-separated format: Col1 | Col2 | Col3\n"
                "   - Include ALL rows and columns — do not truncate\n"
                "   - Preserve numeric values exactly (do not round)\n"
                "   - Note any column headers, totals rows, or summary rows\n\n"
                "3. FORMS / REPORTS — Extract every label-value pair verbatim.\n\n"
                "4. DIAGRAMS / FLOWCHARTS / CHARTS — Describe:\n"
                "   - What type of diagram it is\n"
                "   - All nodes/steps and their labels\n"
                "   - All connections, arrows, and their direction/meaning\n"
                "   - Any legend, axis labels, or numeric values\n\n"
                "5. OTHER TEXT — Extract all visible text verbatim, preserving layout.\n\n"
                "Format your response with clear section headers like:\n"
                "## Document Type\n"
                "## Key Fields\n"
                "## Table Data\n"
                "## Summary / Totals\n"
                "## Additional Information\n\n"
                "Be exhaustive — every number and label matters for question-answering."
            )

            response = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                max_tokens=8192,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": data_url}},
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )

            extracted = response.choices[0].message.content.strip()
            if not extracted:
                raise ValueError("Vision model returned empty extraction")

            # Prepend image context for RAG retrieval
            doc_text = f"[Image] {filename}\n\n{extracted}"
            chunks = ingest_text(doc_text, source=f"image:{filename}", namespace=org_id)

            with _get_conn() as conn:
                conn.execute(
                    "UPDATE ingest_history SET chunks_created=?, status='done' WHERE ingest_id=?",
                    (chunks, ingest_id),
                )
                conn.commit()

            logger.info("image_done", ingest_id=ingest_id, filename=filename, chunks=chunks)

        except Exception as e:
            logger.error("image_processing_failed", filename=filename, error=str(e), ingest_id=ingest_id)
            try:
                from src.memory.sqlite_store import get_conn as _get_conn
                with _get_conn() as conn:
                    conn.execute(
                        "UPDATE ingest_history SET status='failed' WHERE ingest_id=?",
                        (ingest_id,),
                    )
                    conn.commit()
            except Exception:
                pass

    background_tasks.add_task(do_process)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "filename": filename,
        "ingest_type": "image",
        "size_bytes": len(content),
        "message": "Image queued for vision extraction. Will be available shortly.",
    }


AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv", ".m4v", ".3gp"}
MAX_MEDIA_SIZE_MB = 500
MAX_MEDIA_SIZE_BYTES = MAX_MEDIA_SIZE_MB * 1024 * 1024


@router.post("/media-file")
async def ingest_media_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    media_type: str = Form("audio"),
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
    org_id = user.get("org_id", "default")

    # Write to database immediately
    logger.info("media_file_queued", ingest_id=ingest_id, filename=filename, media_type=media_type, user_id=user_id)
    write_ingest(ingest_id, user_id, media_type, filename, file_size=len(content), chunks=0)

    def do_process():
        import tempfile as _tempfile
        import pathlib as _pathlib
        import subprocess as _subprocess
        from src.memory.sqlite_store import get_conn as _get_conn

        def _set_status(status: str, chunks: int = 0):
            with _get_conn() as c:
                c.execute(
                    "UPDATE ingest_history SET status=?, chunks_created=? WHERE ingest_id=?",
                    (status, chunks, ingest_id),
                )
                c.commit()

        tmp_dir = _tempfile.mkdtemp()
        try:
            from groq import Groq as _Groq
            import imageio_ffmpeg as _ffmpeg

            logger.info("media_file_processing", filename=filename, media_type=media_type,
                        user_id=user_id, ingest_id=ingest_id, size_mb=round(len(content)/1024/1024, 1))

            audio_path = save_path  # default: use file directly (works for mp3/wav/m4a etc.)

            # For video files — extract audio track with ffmpeg first
            if media_type == "video" or ext in {".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv", ".m4v", ".3gp"}:
                ffmpeg_exe = _ffmpeg.get_ffmpeg_exe()
                extracted_audio = _pathlib.Path(tmp_dir) / "extracted_audio.mp3"
                cmd = [
                    ffmpeg_exe, "-y",
                    "-i", str(save_path),
                    "-vn",                    # drop video stream
                    "-acodec", "libmp3lame",
                    "-ab", "64k",             # 64kbps — good balance for Whisper
                    "-ar", "16000",           # 16kHz sample rate (Whisper optimal)
                    str(extracted_audio),
                ]
                result = _subprocess.run(cmd, capture_output=True, timeout=300)
                if result.returncode != 0:
                    raise RuntimeError(f"ffmpeg audio extraction failed: {result.stderr.decode()[:500]}")
                audio_path = extracted_audio
                logger.info("media_audio_extracted", ingest_id=ingest_id,
                            audio_size_mb=round(audio_path.stat().st_size/1024/1024, 1))

            # Transcribe with Groq Whisper
            groq_client = _Groq()
            audio_size_mb = audio_path.stat().st_size / 1024 / 1024

            # Groq Whisper limit is 25MB — warn but attempt anyway
            if audio_size_mb > 25:
                logger.warning("media_file_large_for_whisper", size_mb=round(audio_size_mb, 1), ingest_id=ingest_id)

            with open(audio_path, "rb") as af:
                transcription = groq_client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=af,
                    response_format="text",
                )

            transcript = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()

            if not transcript:
                raise ValueError("Whisper returned empty transcript")

            logger.info("media_whisper_done", ingest_id=ingest_id, chars=len(transcript))

            # Build document and ingest into Pinecone
            doc_text = (
                f"[{media_type.capitalize()} File] {filename}\n\n"
                f"## Audio Transcript (Whisper — high accuracy)\n\n"
                f"{transcript}"
            )
            chunks = ingest_text(doc_text, source=f"{media_type}:{filename}", namespace=org_id)
            _set_status("done", chunks)

            logger.info("media_file_done", ingest_id=ingest_id, filename=filename,
                        chunks=chunks, chars=len(transcript))

        except Exception as e:
            logger.error("media_file_processing_failed", filename=filename,
                         media_type=media_type, error=str(e), ingest_id=ingest_id)
            _set_status("failed", 0)
        finally:
            import shutil as _shutil
            _shutil.rmtree(tmp_dir, ignore_errors=True)

    background_tasks.add_task(do_process)

    return {
        "ingest_id": ingest_id,
        "status": "processing",
        "filename": filename,
        "ingest_type": media_type,
        "size_bytes": len(content),
        "message": f"{media_type.capitalize()} queued — extracting audio and transcribing with Whisper. This may take 1–2 minutes.",
    }


@router.get("/list")
async def list_ingestion_history(
    user: dict = Depends(require_role("user")),
):
    """List all ingested items for the current user."""
    user_id = user["user_id"]
    logger.info("ingest_list_requested", user_id=user_id)
    try:
        items = get_ingest_history(user_id)
        logger.info("ingest_list_retrieved", user_id=user_id, count=len(items))
        # Map backend type names to frontend tab keys
        TYPE_MAP = {
            "document": "documents",
            "text": "text",
            "audio": "audio",
            "video": "video",
            "weblink": "weblinks",
            "youtube": "youtube",
            "image": "images",
        }
        # Group by type
        by_type = {}
        for item in items:
            t = TYPE_MAP.get(item["ingest_type"], item["ingest_type"])
            if t not in by_type:
                by_type[t] = []
            by_type[t].append({
                "ingest_id": item["ingest_id"],
                "name": item["source_name"],
                "url": item["source_url"],
                "size_bytes": item["file_size_bytes"],
                "chunks": item["chunks_created"],
                "created_at": item["created_at"],
                "status": item.get("status", "done"),
                "progress": item.get("progress", 0),
                "progress_label": item.get("progress_label", ""),
            })
        return {"by_type": by_type, "total": len(items)}
    except Exception as e:
        logger.error("list_ingest_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list ingestions")


@router.post("/{ingest_id}/retry")
async def retry_ingest_endpoint(
    ingest_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("user")),
):
    """Retry a failed ingestion — supports document, image, video, audio."""
    user_id = user["user_id"]
    org_id = user.get("org_id", "default")

    with get_conn() as conn:
        row = conn.execute(
            "SELECT source_name, source_url, file_size_bytes, status, ingest_type FROM ingest_history "
            "WHERE ingest_id=? AND user_id=? AND ingest_type IN ('document','image','video','audio','weblink')",
            (ingest_id, user_id)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Ingest record not found or type not retryable")

    filename = row["source_name"]
    source_url = row["source_url"]
    ingest_type = row["ingest_type"]
    ext = Path(filename).suffix.lower()

    # Weblink retry — no file on disk, re-fetch from URL
    if ingest_type == "weblink":
        if not source_url:
            raise HTTPException(status_code=400, detail="No source URL stored for this weblink entry.")
        with get_conn() as conn:
            conn.execute(
                "UPDATE ingest_history SET status='processing', chunks_created=0 WHERE ingest_id=?",
                (ingest_id,)
            )
            conn.commit()

        def _set_status(status: str, chunks: int = 0):
            with get_conn() as c:
                c.execute(
                    "UPDATE ingest_history SET status=?, chunks_created=? WHERE ingest_id=?",
                    (status, chunks, ingest_id),
                )
                c.commit()

        def do_retry_weblink():
            try:
                import requests as _requests
                from bs4 import BeautifulSoup as _BS

                headers = {
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                    "Accept-Language": "en-US,en;q=0.9",
                }
                resp = _requests.get(source_url, headers=headers, timeout=20, allow_redirects=True)
                resp.raise_for_status()
                soup = _BS(resp.text, "lxml")
                for tag in soup(["script", "style", "nav", "footer", "header",
                                  "aside", "form", "noscript", "iframe"]):
                    tag.decompose()
                all_tables = soup.find_all("table")
                all_tables_sorted = sorted(
                    all_tables,
                    key=lambda t: len(list(t.parents)),
                    reverse=True,
                )
                for table in all_tables_sorted:
                    if table.parent is None:
                        continue
                    rows_text = _html_table_to_text(table)
                    if rows_text:
                        table.replace_with("\n" + "\n".join(rows_text) + "\n")
                page_title = (soup.title.string.strip()
                              if soup.title and soup.title.string else filename)
                main_block = (
                    soup.find("article") or soup.find("main")
                    or soup.find("div", {"id": "content"})
                    or soup.find("div", {"class": "mw-parser-output"})
                    or soup.body
                )
                raw_text = main_block.get_text(separator="\n") if main_block else soup.get_text(separator="\n")
                lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
                deduped, prev = [], None
                for ln in lines:
                    if ln != prev:
                        deduped.append(ln)
                    prev = ln
                page_text = "\n".join(deduped)[:200_000]
                if len(page_text) < 50:
                    raise ValueError("Extracted text too short")
                doc_text = f"[Web Page] {page_title}\nURL: {source_url}\n\n{page_text}"
                chunks = ingest_text(doc_text, source=f"weblink:{filename}", namespace=org_id)
                _set_status("done", chunks)
                logger.info("weblink_retry_done", ingest_id=ingest_id, chunks=chunks)
            except Exception as e:
                logger.error("weblink_retry_failed", ingest_id=ingest_id, error=str(e))
                _set_status("failed", 0)

        background_tasks.add_task(do_retry_weblink)
        return {
            "status": "processing",
            "ingest_id": ingest_id,
            "message": f"Retrying weblink ingestion for '{filename}'",
        }

    # Find the saved file — match by user prefix and extension
    saved_files = list(UPLOADS_DIR.glob(f"{user_id}_*"))
    matches = [f for f in saved_files if f.suffix.lower() == ext]
    if not matches:
        raise HTTPException(status_code=404, detail=f"Original file not found on disk. Please re-upload '{filename}'.")

    # Use the most recently modified matching file
    file_path = sorted(matches, key=lambda f: f.stat().st_mtime, reverse=True)[0]
    content = file_path.read_bytes()

    # Reset status to processing
    with get_conn() as conn:
        conn.execute(
            "UPDATE ingest_history SET status='processing', chunks_created=0 WHERE ingest_id=?",
            (ingest_id,)
        )
        conn.commit()

    def _set_status(status: str, chunks: int = 0):
        with get_conn() as c:
            c.execute(
                "UPDATE ingest_history SET status=?, chunks_created=? WHERE ingest_id=?",
                (status, chunks, ingest_id),
            )
            c.commit()

    def do_retry():
        try:
            if ingest_type == "document":
                def _on_progress_retry(pct: int, label: str):
                    set_ingest_progress(ingest_id, pct, label)
                n = ingest_file(str(file_path), namespace=org_id, source_name=filename, on_progress=_on_progress_retry)
                set_ingest_progress(ingest_id, 100, "Done")
                _set_status("done", n)
                logger.info("document_retry_done", ingest_id=ingest_id, chunks=n, filename=filename)

            elif ingest_type == "image":
                import base64
                from groq import Groq as _Groq

                mime = IMAGE_MIME_MAP.get(ext, "image/jpeg")
                b64_data = base64.standard_b64encode(content).decode("utf-8")
                data_url = f"data:{mime};base64,{b64_data}"

                client = _Groq()
                prompt = (
                    "You are an expert document analysis assistant. Extract all structured information "
                    "from this image for a RAG system.\n\n"
                    "1. INVOICES/RECEIPTS: vendor, invoice #, date, all line items (Qty/Price/Amount), subtotal, tax, total\n"
                    "2. TABLES/EXCEL: full pipe-separated table with all rows/columns\n"
                    "3. FORMS/REPORTS: all label-value pairs\n"
                    "4. DIAGRAMS/FLOWCHARTS: type, nodes, connections, labels\n"
                    "5. OTHER TEXT: verbatim extraction\n\n"
                    "Use headers: ## Document Type, ## Key Fields, ## Table Data, ## Summary / Totals"
                )
                response = client.chat.completions.create(
                    model="meta-llama/llama-4-scout-17b-16e-instruct",
                    max_tokens=8192,
                    messages=[{"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": prompt},
                    ]}],
                )
                extracted = response.choices[0].message.content.strip()
                if not extracted:
                    raise ValueError("Empty extraction from vision model")
                doc_text = f"[Image] {filename}\n\n{extracted}"
                chunks = ingest_text(doc_text, source=f"image:{filename}", namespace=org_id)
                _set_status("done", chunks)
                logger.info("image_retry_done", ingest_id=ingest_id, chunks=chunks)

            elif ingest_type in ("video", "audio"):
                import tempfile as _tempfile
                import subprocess as _subprocess
                import imageio_ffmpeg as _ffmpeg
                from groq import Groq as _Groq

                tmp_dir = _tempfile.mkdtemp()
                try:
                    save_path = Path(tmp_dir) / filename
                    save_path.write_bytes(content)
                    audio_path = save_path

                    VIDEO_EXTS = {".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv", ".m4v", ".3gp"}
                    if ext in VIDEO_EXTS:
                        extracted_audio = Path(tmp_dir) / "audio.mp3"
                        ffmpeg_exe = _ffmpeg.get_ffmpeg_exe()
                        cmd = [ffmpeg_exe, "-y", "-i", str(save_path), "-vn",
                               "-acodec", "libmp3lame", "-ab", "64k", "-ar", "16000",
                               str(extracted_audio)]
                        _subprocess.run(cmd, capture_output=True, timeout=300, check=True)
                        audio_path = extracted_audio

                    size_mb = audio_path.stat().st_size / 1024 / 1024
                    if size_mb > 25:
                        logger.warning("media_retry_large_file", size_mb=round(size_mb, 1), filename=filename)

                    groq_client = _Groq()
                    with open(audio_path, "rb") as af:
                        transcription = groq_client.audio.transcriptions.create(
                            model="whisper-large-v3", file=af, response_format="text"
                        )
                    transcript = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
                    doc_text = (
                        f"[{ingest_type.capitalize()} File] {filename}\n\n"
                        f"## Audio Transcript (Whisper — high accuracy)\n\n{transcript}"
                    )
                    chunks = ingest_text(doc_text, source=f"{ingest_type}:{filename}", namespace=org_id)
                    _set_status("done", chunks)
                    logger.info("media_retry_done", ingest_id=ingest_id, chunks=chunks, filename=filename)
                finally:
                    import shutil as _shutil
                    _shutil.rmtree(tmp_dir, ignore_errors=True)

        except Exception as e:
            logger.error("retry_failed", ingest_id=ingest_id, ingest_type=ingest_type, error=str(e))
            _set_status("failed", 0)

    background_tasks.add_task(do_retry)
    return {
        "status": "processing",
        "ingest_id": ingest_id,
        "message": f"Retrying {ingest_type} ingestion for '{filename}'",
    }


@router.delete("/{ingest_id}")
async def delete_ingest_endpoint(
    ingest_id: str,
    user: dict = Depends(require_role("user")),
):
    """Delete an ingested item, its Pinecone vectors, and all related cache entries."""
    source_name = delete_ingest(ingest_id, user["user_id"])
    if source_name is None:
        raise HTTPException(status_code=404, detail="Ingest item not found or already deleted")

    namespace = user.get("org_id", "default")

    # Delete vectors from Pinecone (all prefix variants: plain, image:, video:, audio:, weblink:)
    vectors_deleted = delete_by_source(source_name, namespace=namespace)

    # Purge any verified-knowledge cache entries that referenced this source
    cache_deleted = delete_cache_by_source(source_name)

    logger.info(
        "ingest_deleted",
        ingest_id=ingest_id,
        source=source_name,
        vectors_deleted=vectors_deleted,
        cache_entries_deleted=cache_deleted,
        user_id=user["user_id"],
    )
    return {
        "status": "deleted",
        "ingest_id": ingest_id,
        "source": source_name,
        "vectors_deleted": vectors_deleted,
        "cache_entries_deleted": cache_deleted,
    }
