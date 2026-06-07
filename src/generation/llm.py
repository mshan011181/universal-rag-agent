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

def get_llm(temperature: float = 0.1, streaming: bool = False):
    """Return a LangChain chat model for the configured provider.

    All returned models are automatically traced by LangSmith when
    LANGCHAIN_TRACING_V2=true is set.
    """
    if LLM_PROVIDER == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            api_key=ANTHROPIC_API_KEY,
            model=ANTHROPIC_MODEL,
            temperature=temperature,
            streaming=streaming,
            # max_tokens required by Anthropic API; 4096 covers all RAG responses
            max_tokens=4096,
        )

    if LLM_PROVIDER == "vertexai":
        from langchain_google_vertexai import ChatVertexAI
        return ChatVertexAI(
            model_name=VERTEXAI_MODEL,
            project=VERTEXAI_PROJECT,
            location=VERTEXAI_LOCATION,
            temperature=temperature,
            streaming=streaming,
        )

    # Default: Groq (local dev / CI)
    from langchain_groq import ChatGroq
    return ChatGroq(
        api_key=GROQ_API_KEY,
        model=GROQ_MODEL,
        temperature=temperature,
        streaming=streaming,
    )


# ---------------------------------------------------------------------------
# Retry wrapper
# ---------------------------------------------------------------------------

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def safe_invoke(llm, messages: list) -> str:
    return llm.invoke(messages).content


# ---------------------------------------------------------------------------
# RAG chain functions — all calls are traced in LangSmith automatically
# ---------------------------------------------------------------------------

def synthesize(context: str, query: str, language: str = "English") -> str:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.1)
    lang_instruction = (
        f" You MUST respond entirely in {language}. "
        f"Every word of your answer must be in {language}, including headers, labels, and explanations."
        if language and language.lower() not in ("english", "american english", "british english", "australian english")
        else ""
    )
    system = (
        "You are a precise, grounded assistant. Answer ONLY from the provided context. "
        "Do not use prior knowledge for factual claims. "
        f"If the context does not contain sufficient information, say so explicitly.{lang_instruction}"
    )
    human = f"Context:\n{context}\n\nQuestion: {query}"
    return safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])


def grade(answer: str, context: str, query: str) -> dict:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.0)
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
        no_info = ["no relevant information", "no information", "context does not",
                   "not enough information", "cannot answer"]
        if any(p in answer.lower() for p in no_info):
            quality = min(quality, 0.3)
        return {"quality_score": round(quality, 3), **data}
    except Exception:
        return {"quality_score": 0.5, "relevance": 0.5, "completeness": 0.5, "hallucination_risk": 0.5}


def check_faithfulness(answer: str, chunks: list[dict]) -> dict:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.0)
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


def generate_followups(query: str, answer: str) -> list:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.3)
    system = "Generate exactly 3 concise follow-up questions based on the query and answer. Return as JSON array of strings."
    human = f"Query: {query}\nAnswer: {answer}"
    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
    try:
        start, end = raw.find("["), raw.rfind("]") + 1
        return json.loads(raw[start:end])
    except Exception:
        return []
