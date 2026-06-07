from src.query_analyzer import analyze_query
from src.pattern_router import route_and_execute
from src.memory.sqlite_store import init_db
from src.models import RAGAgentResponse

_initialized = False


def _ensure_init():
    global _initialized
    if not _initialized:
        init_db()
        _initialized = True


def ask(query: str, session_id: str = "default", namespace: str = "default", language: str = "English") -> RAGAgentResponse:
    _ensure_init()
    analysis = analyze_query(query, session_id)
    analysis["namespace"] = namespace
    analysis["language"] = language
    response = route_and_execute(analysis, session_id)
    return response, analysis
