"""
LLM provider abstraction with LangSmith tracing.

LLM_PROVIDER=groq        → Groq Llama (local dev / CI)
LLM_PROVIDER=anthropic   → Anthropic Claude direct API (recommended for production enterprise)
LLM_PROVIDER=vertexai    → Vertex AI Claude via ADC (GCP-native production)

LangSmith tracing is enabled automatically when LANGCHAIN_TRACING_V2=true is set.
All providers route through LangChain, so every chain, retrieval, and grading call
is captured in LangSmith with full token counts, latency, and cost per run.

Tracing env vars (set in Secret Manager / Cloud Run):
  LANGCHAIN_TRACING_V2=true
  LANGCHAIN_API_KEY=<langsmith-api-key>
  LANGCHAIN_PROJECT=universal-rag-enterprise
  LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
"""

import os
import json
import logging
import threading

from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import (
    GROQ_API_KEY, GROQ_MODEL,
    ANTHROPIC_API_KEY, ANTHROPIC_MODEL,
    VERTEXAI_PROJECT, VERTEXAI_LOCATION, VERTEXAI_MODEL,
    LANGSMITH_API_KEY, LANGSMITH_PROJECT, LANGSMITH_ENDPOINT,
)

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")

# ---------------------------------------------------------------------------
# LangSmith bootstrap
# ---------------------------------------------------------------------------
# LangChain reads these four env vars automatically — no extra code needed.
# We set them here so any provider (groq / anthropic / vertexai) is covered
# without modifying individual chain files.

def _configure_langsmith() -> None:
    """Push LangSmith config into env if the key is available."""
    if not LANGSMITH_API_KEY:
        return
    # Only enable if not already forced off by the caller
    if os.getenv("LANGCHAIN_TRACING_V2", "").lower() not in ("false", "0"):
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
        os.environ.setdefault("LANGCHAIN_API_KEY", LANGSMITH_API_KEY)
        os.environ.setdefault("LANGCHAIN_PROJECT", LANGSMITH_PROJECT)
        os.environ.setdefault("LANGCHAIN_ENDPOINT", LANGSMITH_ENDPOINT)
        logger.info("LangSmith tracing enabled → project=%s", LANGSMITH_PROJECT)


_configure_langsmith()


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------

# Model registry — shown in UI model selector
# Format: { "display_label": ("provider", "api_model_id", context_window_k) }
MODEL_REGISTRY: dict[str, tuple[str, str]] = {
    "Claude Sonnet 4.6 (Best)":    ("anthropic", "claude-sonnet-4-6"),
    "Claude Haiku 4.5 (Fast)":     ("anthropic", "claude-haiku-4-5-20251001"),
    "Llama 3.3 70B (Free/Fast)":   ("groq",      "llama-3.3-70b-versatile"),
    "Llama 3.1 8B (Fastest)":      ("groq",      "llama-3.1-8b-instant"),
}

# Extended metadata: context window (tokens) and pricing (USD per million tokens)
MODEL_METADATA: dict[str, dict] = {
    "claude-sonnet-4-6":           {"context_k": 200, "input_usd_per_mtok": 3.0,  "output_usd_per_mtok": 15.0, "free": False},
    "claude-haiku-4-5-20251001":   {"context_k": 200, "input_usd_per_mtok": 0.8,  "output_usd_per_mtok": 4.0,  "free": False},
    "llama-3.3-70b-versatile":     {"context_k": 128, "input_usd_per_mtok": 0.0,  "output_usd_per_mtok": 0.0,  "free": True},
    "llama-3.1-8b-instant":        {"context_k": 128, "input_usd_per_mtok": 0.0,  "output_usd_per_mtok": 0.0,  "free": True},
}

# Reverse lookup: api_model_id → provider
_MODEL_ID_TO_PROVIDER: dict[str, str] = {mid: prov for prov, mid in MODEL_REGISTRY.values()}  # type: ignore

# ---------------------------------------------------------------------------
# Per-request token usage tracker (thread-local)
# ---------------------------------------------------------------------------

_token_usage = threading.local()


def reset_token_usage() -> None:
    _token_usage.calls = []


def record_token_usage(model_id: str, input_tokens: int, output_tokens: int) -> None:
    if not hasattr(_token_usage, "calls"):
        _token_usage.calls = []
    _token_usage.calls.append({
        "model": model_id,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    })


def get_token_usage() -> dict:
    calls = getattr(_token_usage, "calls", [])
    total_input = sum(c["input_tokens"] for c in calls)
    total_output = sum(c["output_tokens"] for c in calls)
    total_tokens = total_input + total_output

    # Estimate cost from the first model seen (dominant model for the query)
    estimated_cost = 0.0
    for c in calls:
        meta = MODEL_METADATA.get(c["model"], {})
        in_rate = meta.get("input_usd_per_mtok", 0.0)
        out_rate = meta.get("output_usd_per_mtok", 0.0)
        estimated_cost += (c["input_tokens"] * in_rate + c["output_tokens"] * out_rate) / 1_000_000

    return {
        "input_tokens": total_input,
        "output_tokens": total_output,
        "total_tokens": total_tokens,
        "llm_calls": len(calls),
        "estimated_cost_usd": round(estimated_cost, 6),
    }


def get_llm(temperature: float = 0.1, streaming: bool = False, model_override: str | None = None):
    """Return a LangChain chat model.

    model_override: api_model_id from MODEL_REGISTRY (e.g. 'claude-sonnet-4-6').
    When provided it takes full precedence over LLM_PROVIDER / env defaults.
    All returned models are automatically traced by LangSmith when
    LANGCHAIN_TRACING_V2=true is set.
    """
    # Resolve provider and model_id from override or env defaults
    if model_override:
        provider = _MODEL_ID_TO_PROVIDER.get(model_override, LLM_PROVIDER)
        model_id = model_override
    else:
        provider = LLM_PROVIDER
        model_id = None  # each branch uses its own default

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            api_key=ANTHROPIC_API_KEY,
            model=model_id or ANTHROPIC_MODEL,
            temperature=temperature,
            streaming=streaming,
            max_tokens=4096,
        )

    if provider == "vertexai":
        from langchain_google_vertexai import ChatVertexAI
        return ChatVertexAI(
            model_name=model_id or VERTEXAI_MODEL,
            project=VERTEXAI_PROJECT,
            location=VERTEXAI_LOCATION,
            temperature=temperature,
            streaming=streaming,
        )

    # Default: Groq
    from langchain_groq import ChatGroq
    return ChatGroq(
        api_key=GROQ_API_KEY,
        model=model_id or GROQ_MODEL,
        temperature=temperature,
        streaming=streaming,
    )


def _get_fallback_llm(temperature: float = 0.1):
    """Return the default Groq LLM as a fallback."""
    from langchain_groq import ChatGroq
    return ChatGroq(api_key=GROQ_API_KEY, model=GROQ_MODEL, temperature=temperature)


# ---------------------------------------------------------------------------
# Retry wrapper
# ---------------------------------------------------------------------------

def _record_response(resp, model_id: str) -> str:
    """Extract content and record token usage from a LangChain response."""
    usage = getattr(resp, "usage_metadata", None)
    if usage:
        record_token_usage(
            model_id=model_id,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )
    return resp.content


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def safe_invoke(llm, messages: list) -> str:
    model_id = getattr(llm, "model", None) or getattr(llm, "model_name", "") or ""
    try:
        resp = llm.invoke(messages)
        return _record_response(resp, model_id)
    except Exception as e:
        err_str = str(e).lower()
        # Anthropic billing/quota errors — fall back to Groq so the query still works
        if "credit balance is too low" in err_str or "insufficient_quota" in err_str or "payment_required" in err_str:
            logger.warning("Anthropic billing error — falling back to Groq: %s", e)
            fallback = _get_fallback_llm()
            resp = fallback.invoke(messages)
            return _record_response(resp, GROQ_MODEL)
        raise


# ---------------------------------------------------------------------------
# RAG chain functions — all calls are traced in LangSmith automatically
# ---------------------------------------------------------------------------

def synthesize(context: str, query: str, language: str = "English", model_override: str | None = None) -> str:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.1, model_override=model_override)
    lang_instruction = (
        f" You MUST respond entirely in {language}. "
        f"Every word of your answer must be in {language}, including headers, labels, and explanations."
        if language and language.lower() not in ("english", "american english", "british english", "australian english")
        else ""
    )
    system = (
        "You are a precise, grounded assistant. Answer ONLY from the provided context. "
        "Do not use prior knowledge for factual claims. "
        "IMPORTANT — use implicit reasoning from the context:\n"
        "- If context says 'scored his Nth [achievement]', that implies a total of N.\n"
        "- If context gives a table with a '100s' or 'centuries' column, read that value directly.\n"
        "- If context gives Home/Away or split rows, sum or note both; do NOT say the overall "
        "figure is unavailable if it can be read or computed from the data present.\n"
        "Format your response using Markdown:\n"
        "- Use **bold** for key terms and headings\n"
        "- Use markdown tables (| Col | Col |) for ANY metrics, comparisons, "
        "lists of items with attributes, pricing, schedules, or structured data\n"
        "- Use numbered lists for sequential steps\n"
        "- Use bullet lists for non-sequential items\n"
        "- Use `code blocks` for commands, scripts, or code\n"
        "- MATH: When the context contains formulas or equations (LaTeX such as "
        "$$...$$, \\frac, \\sum, \\vec, \\hat, or symbols like ∫ ∑ √), reproduce them "
        "VERBATIM. Do not paraphrase a formula into words. If the context gives a "
        "general/summation form (e.g. a sum over n terms), state that general formula "
        "explicitly. ALWAYS wrap math in LaTeX delimiters so it renders: inline math "
        "in single $...$ and display equations in $$...$$ (e.g. write $\\vec F_{21}$, "
        "not \\vec F_{21} or F_{21}). This is required for correct rendering.\n"
        f"Only say the context is insufficient when no relevant data exists at all.{lang_instruction}"
    )
    human = f"Context:\n{context}\n\nQuestion: {query}"
    return safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])


def synthesize_cross(
    context: str,
    query: str,
    sources: list[str],
    language: str = "English",
    model_override: str | None = None,
) -> str:
    """Cross-document synthesis — explicitly labels claims by source and synthesizes."""
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = get_llm(temperature=0.1, model_override=model_override)

    lang_instruction = (
        f" You MUST respond entirely in {language}. "
        f"Every word of your answer must be in {language}."
        if language and language.lower() not in (
            "english", "american english", "british english", "australian english"
        )
        else ""
    )

    src_labels = "\n".join(f"  - [{i+1}] {s}" for i, s in enumerate(sources))

    system = (
        "You are a precise cross-document analyst. "
        "The context contains content drawn from multiple documents, each labeled [Source: …].\n\n"
        f"Documents in context:\n{src_labels}\n\n"
        "Instructions:\n"
        "1. Answer the question by synthesizing information from ALL documents present.\n"
        "2. Clearly attribute each claim to its source using the document name.\n"
        "3. Use a **Comparison** or **Synthesis** section when both documents address the same topic.\n"
        "4. Use a **Unique to [Doc]** section for information found in only one document.\n"
        "5. If the documents contradict each other, call it out explicitly under **Conflicts**.\n"
        "6. Format using Markdown: bold headings, tables for side-by-side comparisons, "
        "bullet lists for attributes.\n"
        "7. Answer ONLY from the provided context — do not use prior knowledge.\n"
        "8. MATH: reproduce any formulas/equations (LaTeX $$...$$, \\frac, \\sum, "
        "\\vec, or symbols ∫ ∑ √) VERBATIM; never paraphrase a formula into words, "
        "and state general/summation forms explicitly when the context provides them.\n"
        f"9. If a document has no relevant content for the query, say so.{lang_instruction}"
    )

    human = f"Context:\n{context}\n\nQuestion: {query}"
    return safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])


def grade(answer: str, context: str, query: str, model_override: str | None = None) -> dict:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.0, model_override=model_override)
    system = (
        "You are a strict quality evaluator for RAG answers. "
        "Score the answer on three dimensions, each 0.0-1.0:\n"
        "- relevance: Does the answer address the query?\n"
        "- completeness: Does it cover all aspects using the context?\n"
        "- hallucination_risk: 0=no hallucination, 1=clear hallucination\n"
        "Respond ONLY with valid JSON: "
        '{"relevance": 0.0, "completeness": 0.0, "hallucination_risk": 0.0, "reasoning": "..."}'
    )
    human = f"Query: {query}\n\nContext:\n{context}\n\nAnswer:\n{answer}"
    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
    try:
        start, end = raw.find("{"), raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        quality = (
            (data.get("relevance", 0.5) + data.get("completeness", 0.5)) / 2
            * (1 - data.get("hallucination_risk", 0) * 0.5)
        )
        # Only penalise answers that are primarily refusals — not answers
        # that happen to include a minor caveat note at the end.
        # Strategy: check if a refusal phrase dominates the FIRST 40% of the
        # answer (before substantive content appears) rather than anywhere.
        answer_lower = answer.lower()
        answer_intro = answer_lower[:max(200, len(answer_lower) // 3)]
        no_info_primary = [
            "no relevant information", "no information available",
            "i don't have", "i do not have", "cannot answer",
            "not enough information to answer",
            "the context does not contain any",
            "there is no information",
            "does not provide a single overall",
            "context does not provide",
            "does not provide the",
            "does not contain sufficient information to",
            "the context does not provide",
        ]
        if any(p in answer_intro for p in no_info_primary):
            quality = min(quality, 0.3)
        return {"quality_score": round(quality, 3), **data}
    except Exception:
        return {"quality_score": 0.5, "relevance": 0.5, "completeness": 0.5, "hallucination_risk": 0.5}


def check_faithfulness(answer: str, chunks: list[dict], model_override: str | None = None) -> dict:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.0, model_override=model_override)
    context_str = "\n".join(f"[{i}] {c.get('content', '')}" for i, c in enumerate(chunks))
    system = (
        "You are a faithfulness verifier. For each sentence in the answer, "
        "identify which context chunk (by index) supports it. "
        "If a sentence has no support, mark it 'unsupported'. "
        'Respond as JSON: {"citation_map": {"sentence_N": {"chunk_idx": N, "supported": true/false}}, "all_supported": true/false}'
    )
    human = f"Answer:\n{answer}\n\nContext chunks:\n{context_str}"
    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
    try:
        start, end = raw.find("{"), raw.rfind("}") + 1
        return json.loads(raw[start:end])
    except Exception:
        return {"citation_map": {}, "all_supported": True}


def generate_followups(query: str, answer: str, model_override: str | None = None) -> list:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.3, model_override=model_override)
    system = "Generate exactly 3 concise follow-up questions based on the query and answer. Return as JSON array of strings."
    human = f"Query: {query}\nAnswer: {answer}"
    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
    try:
        start, end = raw.find("["), raw.rfind("]") + 1
        return json.loads(raw[start:end])
    except Exception:
        return []
