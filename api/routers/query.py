import time
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional
import structlog

from api.auth_utils import get_current_user_or_api_key
from src.agent import ask

logger = structlog.get_logger()
router = APIRouter()


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = Field(default="default", max_length=64)
    stream: bool = False
    language: str = Field(default="English", max_length=50)


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
    session_id: str
    request_id: Optional[str] = None


@router.post("/", response_model=QueryResponse)
async def query_endpoint(
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
        response, analysis = ask(query, scoped_session, namespace=namespace, language=body.language)
    except Exception as e:
        logger.error("query_failed", error=str(e), user_id=user["user_id"])
        raise HTTPException(status_code=500, detail="Query processing failed")

    logger.info(
        "query_complete",
        user_id=user["user_id"],
        patterns=response.patterns_used,
        quality=response.quality_score,
        latency_ms=response.latency_ms,
    )

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
        session_id=body.session_id,
    )
