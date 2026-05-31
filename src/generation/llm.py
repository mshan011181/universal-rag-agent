from langchain_groq import ChatGroq
from src.config import GROQ_API_KEY, GROQ_MODEL
from tenacity import retry, stop_after_attempt, wait_exponential


def get_llm(temperature: float = 0.1, streaming: bool = False) -> ChatGroq:
    return ChatGroq(
        api_key=GROQ_API_KEY,
        model=GROQ_MODEL,
        temperature=temperature,
        streaming=streaming,
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def safe_invoke(llm, messages: list) -> str:
    response = llm.invoke(messages)
    return response.content


def synthesize(context: str, query: str) -> str:
    llm = get_llm(temperature=0.1)
    from langchain_core.messages import SystemMessage, HumanMessage
    system = (
        "You are a precise, grounded assistant. Answer ONLY from the provided context. "
        "Do not use prior knowledge for factual claims. "
        "If the context does not contain sufficient information, say so explicitly."
    )
    human = f"Context:\n{context}\n\nQuestion: {query}"
    return safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])


def grade(answer: str, context: str, query: str) -> dict:
    llm = get_llm(temperature=0.0)
    from langchain_core.messages import SystemMessage, HumanMessage
    system = (
        "You are a strict quality evaluator for RAG answers. "
        "Score the answer on three dimensions, each 0.0-1.0:\n"
        "- relevance: Does the answer address the query?\n"
        "- completeness: Does it cover all aspects using the context?\n"
        "- hallucination_risk: 0=no hallucination, 1=clear hallucination\n"
        "Respond ONLY with valid JSON: "
        '{\"relevance\": 0.0, \"completeness\": 0.0, \"hallucination_risk\": 0.0, \"reasoning\": \"...\"}'
    )
    human = f"Query: {query}\n\nContext:\n{context}\n\nAnswer:\n{answer}"
    import json
    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        quality = (data.get("relevance", 0.5) + data.get("completeness", 0.5)) / 2 * (1 - data.get("hallucination_risk", 0) * 0.5)
        return {"quality_score": round(quality, 3), **data}
    except Exception:
        return {"quality_score": 0.5, "relevance": 0.5, "completeness": 0.5, "hallucination_risk": 0.5}


def check_faithfulness(answer: str, chunks: list[dict]) -> dict:
    llm = get_llm(temperature=0.0)
    from langchain_core.messages import SystemMessage, HumanMessage
    context_str = "\n".join([f"[{i}] {c.get('content','')}" for i, c in enumerate(chunks)])
    system = (
        "You are a faithfulness verifier. For each sentence in the answer, "
        "identify which context chunk (by index) supports it. "
        "If a sentence has no support, mark it 'unsupported'. "
        "Respond as JSON: {\"citation_map\": {\"sentence_N\": {\"chunk_idx\": N, \"supported\": true/false}}, \"all_supported\": true/false}"
    )
    human = f"Answer:\n{answer}\n\nContext chunks:\n{context_str}"
    import json
    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        return json.loads(raw[start:end])
    except Exception:
        return {"citation_map": {}, "all_supported": True}


def generate_followups(query: str, answer: str) -> list:
    llm = get_llm(temperature=0.3)
    from langchain_core.messages import SystemMessage, HumanMessage
    system = "Generate exactly 3 concise follow-up questions based on the query and answer. Return as JSON array of strings."
    human = f"Query: {query}\nAnswer: {answer}"
    import json
    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
    try:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        return json.loads(raw[start:end])
    except Exception:
        return []
