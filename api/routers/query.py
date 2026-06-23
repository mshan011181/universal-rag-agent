import base64
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional
import structlog

from api.auth_utils import get_current_user_or_api_key
from src.agent import ask
from src.memory.sqlite_store import write_audit
from src.generation.llm import MODEL_REGISTRY, MODEL_METADATA

logger = structlog.get_logger()
router = APIRouter()


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = Field(default="default", max_length=64)
    stream: bool = False
    language: str = Field(default="English", max_length=50)
    source_filters: list[str] = Field(default_factory=list)
    force_bi: bool = False
    model: Optional[str] = Field(default=None, max_length=100)  # api_model_id from MODEL_REGISTRY


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    llm_calls: int = 0
    estimated_cost_usd: float = 0.0


class QueryResponse(BaseModel):
    answer: str
    quality_score: float
    confidence: str
    faithfulness: str
    patterns_used: list[str]
    latency_ms: int
    retrieval_channel: str
    fallback_used: bool
    verified_knowledge_hit: bool
    suggested_followups: list[str]
    citation_map: dict
    figures: list[str] = []
    session_id: str
    model_used: Optional[str] = None
    token_usage: Optional[TokenUsage] = None
    request_id: Optional[str] = None


@router.get("/models")
async def list_models(user: dict = Depends(get_current_user_or_api_key)):
    """Return available LLM models with pricing/context metadata for the UI."""
    models = []
    for label, (provider, model_id) in MODEL_REGISTRY.items():
        meta = MODEL_METADATA.get(model_id, {})
        models.append({
            "label": label,
            "model_id": model_id,
            "provider": provider,
            "context_k": meta.get("context_k", 0),
            "input_usd_per_mtok": meta.get("input_usd_per_mtok", 0.0),
            "output_usd_per_mtok": meta.get("output_usd_per_mtok", 0.0),
            "free": meta.get("free", False),
        })
    return {"models": models}


@router.get("/token-stats")
async def token_stats(user: dict = Depends(get_current_user_or_api_key)):
    """Return cumulative token usage for the current user from audit logs."""
    from src.memory.sqlite_store import get_conn
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT detail FROM audit_log WHERE event_type='query' AND user_id=?",
            (user["user_id"],),
        ).fetchall()
    finally:
        conn.close()

    total_input = 0
    total_output = 0
    total_cost = 0.0
    query_count = 0

    for (detail_str,) in rows:
        try:
            detail = json.loads(detail_str) if detail_str else {}
        except Exception:
            continue
        tu = detail.get("token_usage") or {}
        total_input += tu.get("input_tokens", 0)
        total_output += tu.get("output_tokens", 0)
        total_cost += tu.get("estimated_cost_usd", 0.0)
        query_count += 1

    return {
        "query_count": query_count,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_input + total_output,
        "total_cost_usd": round(total_cost, 4),
    }


@router.post("/", response_model=QueryResponse)
async def query_endpoint(
    request: Request,
    body: QueryRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user_or_api_key),
):
    # Sanitize input
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Scope session to user
    scoped_session = f"{user['user_id']}:{body.session_id}"

    # Use org_id as namespace so queries search the user's own documents
    namespace = user.get("org_id") or "default"

    try:
        response, analysis = ask(
            query, scoped_session,
            namespace=namespace,
            language=body.language,
            source_filters=body.source_filters or [],
            user_id=user["user_id"],
            force_bi=body.force_bi,
            model_override=body.model or None,
        )
    except Exception as e:
        err_str = str(e).lower()
        logger.error("query_failed", error=str(e), user_id=user["user_id"])
        if "credit balance is too low" in err_str or "insufficient_quota" in err_str:
            raise HTTPException(
                status_code=402,
                detail="Anthropic API credits are exhausted. Please add credits at console.anthropic.com or switch to a Groq/Llama model.",
            )
        raise HTTPException(status_code=500, detail="Query processing failed")

    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else None)
    write_audit(
        event_type="query",
        user_id=user["user_id"],
        email=user.get("email"),
        org_id=user.get("org_id"),
        detail={
            "query": query[:500],
            "patterns": response.patterns_used,
            "quality_score": response.quality_score,
            "latency_ms": response.latency_ms,
            "channel": response.retrieval_channel,
            "cache_hit": response.verified_knowledge_hit,
            "token_usage": response.token_usage,
        },
        ip_address=ip,
    )

    logger.info(
        "query_complete",
        user_id=user["user_id"],
        patterns=response.patterns_used,
        quality=response.quality_score,
        latency_ms=response.latency_ms,
    )

    tu = response.token_usage or {}
    return QueryResponse(
        answer=response.answer_text,
        quality_score=response.quality_score,
        confidence=response.confidence,
        faithfulness=response.faithfulness,
        patterns_used=response.patterns_used,
        latency_ms=response.latency_ms,
        retrieval_channel=response.retrieval_channel,
        fallback_used=response.fallback_used,
        verified_knowledge_hit=response.verified_knowledge_hit,
        suggested_followups=response.suggested_followups,
        citation_map=response.citation_map,
        figures=getattr(response, "figures", []),
        session_id=body.session_id,
        model_used=body.model,
        token_usage=TokenUsage(**tu) if tu else None,
    )


# ── Image-based batch query ────────────────────────────────────────────────────

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


class ImageQueryItem(BaseModel):
    question: str
    answer: str
    quality_score: float
    confidence: str
    patterns_used: list[str]
    latency_ms: int
    citation_map: dict
    suggested_followups: list[str]


class ImageQueryResponse(BaseModel):
    questions_found: int
    results: list[ImageQueryItem]
    extraction_note: str = ""


def _extract_questions_from_image(image_bytes: bytes, content_type: str) -> list[str]:
    """Use Groq Vision to extract a numbered list of questions from an image."""
    ext = content_type.split("/")[-1].replace("jpeg", "jpg")
    mime_map = {
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "webp": "image/webp", "gif": "image/gif", "bmp": "image/bmp",
    }
    mime = mime_map.get(ext, "image/png")
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime};base64,{b64}"

    prompt = (
        "This image contains one or more questions (e.g. a question paper, exam sheet, or form).\n"
        "Extract every question exactly as written, one per line.\n"
        "Output ONLY the questions, numbered 1. 2. 3. etc.\n"
        "Do NOT include answers, instructions, or any other text.\n"
        "If no questions are found, output: NO_QUESTIONS_FOUND"
    )

    try:
        from groq import Groq
        client = Groq()
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            max_tokens=2048,
            messages=[{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt},
            ]}],
        )
        raw = response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision extraction failed: {e}")

    return _parse_question_lines(raw)


def _parse_question_lines(raw: str) -> list[str]:
    """Turn an LLM's numbered-list output into a clean list of questions."""
    if "NO_QUESTIONS_FOUND" in raw:
        return []
    import re
    questions = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading numbering like "1." "1)" "Q1."
        cleaned = re.sub(r'^(?:Q?\d+[\.\)]\s*)', '', line).strip()
        if cleaned:
            questions.append(cleaned)
    return questions


def _extract_text_from_upload(file_bytes: bytes, filename: str, content_type: str) -> str:
    """Extract plain text from any supported file (PDF, DOCX, TXT, MD, CSV)."""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    ctype = content_type or ""

    if ext == ".pdf" or ctype == "application/pdf":
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes), strict=False)
        return "\n".join((page.extract_text() or "") for page in reader.pages)

    if ext in {".docx", ".doc"} or "word" in ctype or "officedocument" in ctype:
        import io
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    # Plain text / markdown / csv / anything else — decode as text
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return file_bytes.decode("latin-1", errors="replace")


def _extract_questions_from_text(text: str) -> list[str]:
    """Use a Groq text model to extract a numbered list of questions from text."""
    text = text.strip()
    if not text:
        return []
    snippet = text[:20000]  # keep the prompt bounded
    prompt = (
        "The following content contains one or more questions (e.g. a question paper, "
        "exam sheet, worksheet, or form).\n"
        "Extract every question exactly as written, one per line.\n"
        "Output ONLY the questions, numbered 1. 2. 3. etc.\n"
        "Do NOT include answers, instructions, or any other text.\n"
        "If no questions are found, output: NO_QUESTIONS_FOUND\n\n"
        f"CONTENT:\n{snippet}"
    )
    try:
        from groq import Groq
        client = Groq()
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Question extraction failed: {e}")
    return _parse_question_lines(raw)


@router.post("/from-image", response_model=ImageQueryResponse)
async def query_from_image(
    request: Request,
    file: UploadFile = File(...),
    language: str = Form(default="American English"),
    session_id: str = Form(default="default"),
    user: dict = Depends(get_current_user_or_api_key),
):
    file_bytes = await file.read()
    if len(file_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File too large — maximum 10 MB.")

    ctype = file.content_type or ""
    filename = file.filename or "upload"

    # Images → Groq Vision; any other file (PDF/DOCX/TXT/CSV/…) → text extraction.
    if ctype in ALLOWED_IMAGE_TYPES or ctype.startswith("image/"):
        questions = _extract_questions_from_image(file_bytes, ctype)
        source_label = "image"
    else:
        try:
            text = _extract_text_from_upload(file_bytes, filename, ctype)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read file '{filename}': {e}")
        questions = _extract_questions_from_text(text)
        source_label = "file"

    if not questions:
        return ImageQueryResponse(questions_found=0, results=[], extraction_note=f"No questions detected in the uploaded {source_label}.")

    namespace = user.get("org_id") or "default"
    scoped_session = f"{user['user_id']}:{session_id}"

    results: list[ImageQueryItem] = []
    for q in questions:
        try:
            response, _ = ask(
                q, scoped_session,
                namespace=namespace,
                language=language,
                source_filters=[],
                user_id=user["user_id"],
            )
            results.append(ImageQueryItem(
                question=q,
                answer=response.answer_text,
                quality_score=response.quality_score,
                confidence=response.confidence,
                patterns_used=response.patterns_used,
                latency_ms=response.latency_ms,
                citation_map=response.citation_map,
                suggested_followups=response.suggested_followups,
            ))
        except Exception as e:
            results.append(ImageQueryItem(
                question=q,
                answer=f"Error processing this question: {e}",
                quality_score=0.0,
                confidence="LOW",
                patterns_used=[],
                latency_ms=0,
                citation_map={},
                suggested_followups=[],
            ))

    return ImageQueryResponse(
        questions_found=len(questions),
        results=results,
        extraction_note=f"Extracted {len(questions)} question(s) from {source_label}.",
    )
