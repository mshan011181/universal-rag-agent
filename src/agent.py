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


def _translate_to_english(query: str) -> str:
    """Translate a non-English question to English for retrieval.

    The embedder (all-MiniLM-L6-v2) is English-only, so a non-English query
    won't match English content. Translating first lets users ask in any
    language over English-ingested data. Best-effort: returns the original
    query on any failure.
    """
    try:
        from src.generation.llm import get_llm, safe_invoke
        from langchain_core.messages import HumanMessage
        prompt = (
            "Translate the following question to English. Return ONLY the "
            "translated question, with no preamble or quotes.\n\n" + query
        )
        out = safe_invoke(get_llm(temperature=0.0), [HumanMessage(content=prompt)]).strip()
        return out or query
    except Exception:
        return query


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
    question_language: str = "",
) -> RAGAgentResponse:
    _ensure_init()
    reset_token_usage()
    # Non-English question over English content: translate to English so retrieval
    # (English-only embedder) can find the right passages. The answer language is
    # still controlled separately by `language`.
    if question_language and question_language.strip().lower() not in ("", "auto", "english", "american english", "british english"):
        query = _translate_to_english(query)
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
