"""
LLM provider abstraction.

LLM_PROVIDER=groq      → Groq Llama (local dev / default)
LLM_PROVIDER=vertexai  → Vertex AI Claude (production on Cloud Run)

Cloud Run uses Application Default Credentials automatically — no API key needed
when the Cloud Run service account has roles/aiplatform.user.
"""

import os
import json
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import GROQ_API_KEY, GROQ_MODEL, VERTEXAI_PROJECT, VERTEXAI_LOCATION, VERTEXAI_MODEL

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")


def get_llm(temperature: float = 0.1, streaming: bool = False):
    if LLM_PROVIDER == "vertexai":
        from langchain_google_vertexai import ChatVertexAI
        return ChatVertexAI(
            model_name=VERTEXAI_MODEL,
            project=VERTEXAI_PROJECT,
            location=VERTEXAI_LOCATION,
            temperature=temperature,
            streaming=streaming,
        )
    from langchain_groq import ChatGroq
    return ChatGroq(
        api_key=GROQ_API_KEY,
        model=GROQ_MODEL,
        temperature=temperature,
        streaming=streaming,
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def safe_invoke(llm, messages: list) -> str:
    return llm.invoke(messages).content


def synthesize(context: str, query: str) -> str:
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = get_llm(temperature=0.1)
    system = (
        "You are a precise, grounded assistant. Answer ONLY from the provided context. "
        "Do not use prior knowledge for factual claims. "
        "If the context does not contain sufficient information, say so explicitly."
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
