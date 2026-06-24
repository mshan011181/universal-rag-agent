from src.query_analyzer import analyze_query
from src.pattern_router import route_and_execute
from src.memory.sqlite_store import init_db
from src.models import RAGAgentResponse
from src.generation.llm import reset_token_usage, get_token_usage

_initialized = False


def _ensure_init():
    global _initialized
    if not _initialized:
        init_db()
        _initialized = True


def ask(
    query: str,
    session_id: str = "default",
    namespace: str = "default",
    language: str = "English",
    source_filters: list[str] | None = None,
    user_id: str = "",
    force_bi: bool = False,
    model_override: str | None = None,
    no_cache: bool = False,
) -> RAGAgentResponse:
    _ensure_init()
    reset_token_usage()
    analysis = analyze_query(query, session_id, force_bi=force_bi)
    analysis["namespace"] = namespace
    analysis["language"] = language
    analysis["user_id"] = user_id
    analysis["no_cache"] = no_cache
    if source_filters:
        analysis["source_filters"] = source_filters
    if model_override:
        analysis["model_override"] = model_override
    response = route_and_execute(analysis, session_id)
    response.token_usage = get_token_usage()
    return response, analysis
