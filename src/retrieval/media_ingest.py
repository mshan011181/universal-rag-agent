"""
Media ingestion: audio files, video files, web pages, YouTube links.
All functions return (chunk_count: int, transcript_or_text: str).
"""
import os
import re
import sys
import tempfile
import subprocess
from pathlib import Path

# Ensure yt-dlp is available in whatever Python environment is running
try:
    import yt_dlp  # noqa: F401
except ModuleNotFoundError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "yt-dlp>=2026.3.17", "-q"])
    import yt_dlp  # noqa: F401

try:
    import trafilatura  # noqa: F401
except ModuleNotFoundError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "trafilatura>=2.0.0", "-q"])
    import trafilatura  # noqa: F401

# ---------------------------------------------------------------------------
# Groq Whisper — audio / video transcription
# ---------------------------------------------------------------------------

GROQ_AUDIO_FORMATS = {".mp3", ".mp4", ".m4a", ".wav", ".ogg", ".flac", ".webm", ".mpga", ".mpeg"}
FFMPEG_CONVERTIBLE = {".avi", ".mkv", ".mov", ".wmv", ".3gp", ".ts"}
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".wav", ".ogg", ".flac", ".webm", ".mpga", ".mpeg"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov", ".wmv", ".3gp", ".ts"}


def _transcribe_with_groq(file_path: str) -> str:
    """Send an audio/video file to Groq Whisper and return transcript text."""
    from groq import Groq
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    with open(file_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=f,
            response_format="text",
        )
    return str(response).strip()


def _extract_audio_from_video(video_path: str) -> str:
    """Use ffmpeg to extract audio as mp3 into a temp file. Returns temp path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "libmp3lame", "-q:a", "4",
        tmp.name,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:300]}")
    return tmp.name


def ingest_audio_file(file_path: str) -> tuple[int, str]:
    """Transcribe an audio file and index into vector store."""
    from src.retrieval.vector_store import ingest_text
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix not in AUDIO_EXTENSIONS:
        raise ValueError(f"Unsupported audio format: {suffix}")

    transcript = _transcribe_with_groq(file_path)
    source_label = f"audio:{path.name}"
    n = ingest_text(transcript, source=source_label)
    return n, transcript


def ingest_video_file(file_path: str) -> tuple[int, str]:
    """Transcribe a video file (extract audio first if needed) and index."""
    from src.retrieval.vector_store import ingest_text
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix not in VIDEO_EXTENSIONS:
        raise ValueError(f"Unsupported video format: {suffix}")

    if suffix == ".mp4":
        # Groq accepts mp4 directly
        audio_path = file_path
        tmp_path = None
    else:
        # Extract audio to mp3 first
        audio_path = _extract_audio_from_video(file_path)
        tmp_path = audio_path

    try:
        transcript = _transcribe_with_groq(audio_path)
    finally:
        if tmp_path and Path(tmp_path).exists():
            Path(tmp_path).unlink()

    source_label = f"video:{path.name}"
    n = ingest_text(transcript, source=source_label)
    return n, transcript


# ---------------------------------------------------------------------------
# Web page ingestion
# ---------------------------------------------------------------------------

def _is_youtube(url: str) -> bool:
    return bool(re.search(r"(youtube\.com/watch|youtu\.be/)", url))


def ingest_webpage(url: str) -> tuple[int, str]:
    """Fetch and extract clean text from a web page, then index."""
    import trafilatura
    from src.retrieval.vector_store import ingest_text

    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError(f"Could not fetch page: {url}")

    text = trafilatura.extract(downloaded, include_comments=False, include_tables=True)
    if not text or len(text.strip()) < 50:
        raise ValueError("Could not extract meaningful text from the page.")

    # derive a short label from the URL
    from urllib.parse import urlparse
    parsed = urlparse(url)
    label = parsed.netloc + parsed.path.rstrip("/").replace("/", "_")[:60]
    source_label = f"web:{label}"

    n = ingest_text(text, source=source_label)
    return n, text


# ---------------------------------------------------------------------------
# YouTube ingestion
# ---------------------------------------------------------------------------

def _extract_video_id(url: str) -> str:
    patterns = [
        r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})",
        r"(?:embed/)([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    raise ValueError(f"Cannot extract YouTube video ID from: {url}")


def _parse_json3_subtitles(json3_path: str) -> str:
    """Parse YouTube json3 subtitle format into plain text."""
    import json
    with open(json3_path, encoding="utf-8") as f:
        data = json.load(f)
    parts = []
    for event in data.get("events", []):
        segs = event.get("segs", [])
        line = "".join(s.get("utf8", "") for s in segs).strip()
        if line and line != "\n":
            parts.append(line)
    return " ".join(parts)


def ingest_youtube(url: str) -> tuple[int, str]:
    """
    Get YouTube transcript using yt-dlp (primary) with Groq Whisper fallback.
    Strategy:
      1. Try to download auto/manual subtitles via yt-dlp (fast, no Whisper cost)
      2. If no subtitles, download audio and transcribe with Groq Whisper
    """
    import yt_dlp
    from src.retrieval.vector_store import ingest_text

    video_id = _extract_video_id(url)
    transcript_text = None

    # Step 1: Try subtitles (no audio download needed)
    with tempfile.TemporaryDirectory() as tmpdir:
        sub_opts = {
            "skip_download": True,
            "writeautomaticsub": True,
            "writesubtitles": True,
            "subtitleslangs": ["en", "en-US"],
            "subtitlesformat": "json3",
            "outtmpl": os.path.join(tmpdir, "subs"),
            "quiet": True,
            "no_warnings": True,
        }
        try:
            with yt_dlp.YoutubeDL(sub_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if not info:
                    raise ValueError(f"YouTube video unavailable or invalid URL: {url}")
            # find the downloaded subtitle file
            sub_files = list(Path(tmpdir).glob("*.json3"))
            if sub_files:
                transcript_text = _parse_json3_subtitles(str(sub_files[0]))
        except yt_dlp.utils.DownloadError as e:
            if "unavailable" in str(e).lower() or "not available" in str(e).lower():
                raise ValueError(
                    "YouTube video is unavailable or does not exist. "
                    "Please check the URL and try again."
                )
        except ValueError:
            raise
        except Exception:
            pass  # fall through to Whisper

    # Step 2: No subtitles → download audio and use Groq Whisper
    if not transcript_text:
        transcript_text = _youtube_whisper_fallback(url)

    if not transcript_text or len(transcript_text.strip()) < 20:
        raise ValueError("Could not extract transcript from this YouTube video.")

    source_label = f"youtube:{video_id}"
    n = ingest_text(transcript_text, source=source_label)
    return n, transcript_text


def _youtube_whisper_fallback(url: str) -> str:
    """Download audio via yt-dlp and transcribe with Groq Whisper."""
    import yt_dlp

    with tempfile.TemporaryDirectory() as tmpdir:
        out_template = os.path.join(tmpdir, "audio.%(ext)s")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": out_template,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "64",
            }],
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        audio_file = os.path.join(tmpdir, "audio.mp3")
        if not Path(audio_file).exists():
            files = list(Path(tmpdir).glob("*"))
            if not files:
                raise RuntimeError("yt-dlp produced no output file. ffmpeg may not be installed.")
            audio_file = str(files[0])

        return _transcribe_with_groq(audio_file)


# ---------------------------------------------------------------------------
# Dispatcher — single entry point used by the UI
# ---------------------------------------------------------------------------

def ingest_url(url: str) -> tuple[int, str]:
    """Route a URL to the correct ingest function."""
    if _is_youtube(url):
        return ingest_youtube(url)
    return ingest_webpage(url)
