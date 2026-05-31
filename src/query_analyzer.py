import hashlib
import json
from src.generation.llm import get_llm, safe_invoke
from src.memory.sqlite_store import get_history, check_verified_knowledge
from langchain_core.messages import SystemMessage, HumanMessage

HIGH_RISK_DOMAINS = ["legal", "medical", "financial", "compliance", "health", "law", "clinical"]


def fingerprint(query: str) -> str:
    return hashlib.md5(query.lower().strip().encode()).hexdigest()[:16]


def analyze_query(query: str, session_id: str) -> dict:
    word_count = len(query.split())
    history = get_history(session_id, last_n=5)
    turn = len(history) + 1
    has_pronouns = any(p in query.lower().split() for p in ["it", "that", "they", "this", "those", "these", "he", "she"])

    # Dimension 1: Query Length
    if word_count <= 3:
        length_signal = "very_short"
    elif word_count <= 15:
        length_signal = "short"
    elif word_count <= 49:
        length_signal = "medium"
    else:
        length_signal = "long"

    # Dimension 5: Conversation State (fast check before LLM)
    conv_active = turn > 1 or bool(history)

    # LLM-based analysis for dimensions 2, 3, 4
    llm = get_llm(temperature=0.0)
    system = """Analyze this query across 3 dimensions. Respond ONLY as JSON:
{
  "ambiguity": "low" | "medium" | "high",
  "complexity": "simple" | "medium" | "complex",
  "data_type": "text" | "image" | "entity" | "table",
  "domain_risk": true | false,
  "has_multi_angles": true | false,
  "query_class": "factual" | "diagnostic" | "comparative" | "conversational" | "research"
}
domain_risk=true if the topic involves legal, medical, financial, or compliance matters."""

    raw = safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=f"Query: {query}")])
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        dims = json.loads(raw[start:end])
    except Exception:
        dims = {
            "ambiguity": "medium", "complexity": "medium", "data_type": "text",
            "domain_risk": False, "has_multi_angles": False, "query_class": "factual"
        }

    # Build pattern list from signals
    patterns = []

    # Dimension 1: Length → HyDE or FLARE
    if length_signal == "very_short":
        patterns.append("hyde")
    elif length_signal == "long":
        patterns.append("flare")

    # Dimension 2: Ambiguity → Query Rewrite or RAG Fusion
    ambiguity = dims.get("ambiguity", "low")
    if ambiguity == "high":
        patterns.append("query_rewrite")
    if dims.get("has_multi_angles"):
        patterns.append("rag_fusion")

    # Dimension 3: Complexity → Adaptive / Agentic
    complexity = dims.get("complexity", "simple")
    if complexity == "complex":
        patterns.append("agentic_rag")
    elif complexity == "simple" and not patterns:
        pass  # fall through to naive_rag

    # Dimension 4: Data Type → GraphRAG / MultiModal
    data_type = dims.get("data_type", "text")
    if data_type == "image":
        patterns.append("multimodal_rag")
    elif data_type == "entity":
        patterns.append("graph_rag")

    # Dimension 5: Conversation State → ConvRAG
    if conv_active:
        if "query_rewrite" not in patterns:
            patterns.append("query_rewrite")
        patterns.insert(0, "conv_rag")

    if has_pronouns and "query_rewrite" not in patterns:
        patterns.append("query_rewrite")

    # Cross-cutting: faithfulness risk
    domain_risk = dims.get("domain_risk", False)
    query_lower = query.lower()
    is_high_risk = domain_risk or any(d in query_lower for d in HIGH_RISK_DOMAINS)
    if is_high_risk:
        if "crag" not in patterns:
            patterns.append("crag")
        if "self_rag" not in patterns:
            patterns.append("self_rag")

    # Always end with naive_rag as base retrieval if no pattern covers retrieval
    retrieval_patterns = {"naive_rag", "hyde", "crag", "agentic_rag", "rag_fusion", "flare", "speculative_rag"}
    if not any(p in retrieval_patterns for p in patterns):
        patterns.append("naive_rag")

    # Speculative RAG for medium/complex when speed matters
    if complexity in ["medium", "complex"] and "agentic_rag" not in patterns and "speculative_rag" not in patterns:
        if length_signal in ["medium", "long"]:
            patterns.append("speculative_rag")

    # Deduplicate preserving order
    seen = set()
    unique_patterns = []
    for p in patterns:
        if p not in seen:
            seen.add(p)
            unique_patterns.append(p)

    return {
        "query": query,
        "fingerprint": fingerprint(query),
        "word_count": word_count,
        "turn": turn,
        "length_signal": length_signal,
        "ambiguity": ambiguity,
        "complexity": complexity,
        "data_type": data_type,
        "domain_risk": is_high_risk,
        "conv_active": conv_active,
        "query_class": dims.get("query_class", "factual"),
        "patterns": unique_patterns,
        "history": history,
    }
