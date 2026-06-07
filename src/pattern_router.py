import time
from src.patterns.naive_rag import NaiveRAG
from src.patterns.hyde import HyDE
from src.patterns.query_rewriting import QueryRewriting
from src.patterns.crag import CRAG
from src.patterns.self_rag import SelfRAG
from src.patterns.rag_fusion import RAGFusion
from src.patterns.conv_rag import ConvRAG
from src.patterns.agentic_rag import AgenticRAG
from src.patterns.flare import FLARE
from src.patterns.speculative_rag import SpeculativeRAG
from src.patterns.graph_rag import GraphRAG
from src.patterns.multimodal_rag import MultiModalRAG
from src.generation.llm import synthesize, grade, generate_followups
from src.retrieval.reranker import rerank
from src.models import RAGAgentResponse
from src.memory.sqlite_store import (
    write_turn, write_performance, write_verified_knowledge,
    check_verified_knowledge
)

PATTERN_MAP = {
    "naive_rag": NaiveRAG(),
    "hyde": HyDE(),
    "query_rewrite": QueryRewriting(),
    "crag": CRAG(),
    "self_rag": SelfRAG(),
    "rag_fusion": RAGFusion(),
    "conv_rag": ConvRAG(),
    "agentic_rag": AgenticRAG(),
    "flare": FLARE(),
    "speculative_rag": SpeculativeRAG(),
    "graph_rag": GraphRAG(),
    "multimodal_rag": MultiModalRAG(),
}

# Dependency order: which patterns produce output for which
SEQUENTIAL_DEPS = {
    "conv_rag": ["query_rewrite"],
    "hyde": ["naive_rag"],
    "query_rewrite": ["crag", "rag_fusion"],
    "crag": ["self_rag"],
    "agentic_rag": ["self_rag"],
}

PARALLEL_SAFE = {"rag_fusion", "speculative_rag", "multimodal_rag"}


def route_and_execute(analysis: dict, session_id: str) -> RAGAgentResponse:
    start_time = time.time()
    query = analysis["query"]
    patterns = analysis["patterns"]
    fingerprint = analysis["fingerprint"]

    # Check verified knowledge cache
    cached = check_verified_knowledge(fingerprint)
    if cached:
        return RAGAgentResponse(
            answer_text=cached,
            quality_score=0.9,
            faithfulness="pass",
            confidence="HIGH",
            patterns_used=["cache_hit"],
            latency_ms=0,
            retrieval_channel="cache",
            verified_knowledge_hit=True,
        )

    state = {
        "query": query,
        "chunks": [],
        "answer": None,
        "citation_map": {},
        "faithfulness": "pass",
        "fallback_used": False,
        "channel": "vector",
        "steps": [],
    }

    # Execute patterns in order, passing state forward
    for pattern_name in patterns:
        pattern = PATTERN_MAP.get(pattern_name)
        if not pattern:
            continue

        try:
            result = pattern.run(
                query=state["query"],
                analysis=analysis,
                chunks=state["chunks"] if state["chunks"] else None,
                answer=state.get("answer"),
            )
            # Merge result into state
            if result.get("chunks"):
                state["chunks"] = result["chunks"]
            if result.get("answer"):
                state["answer"] = result["answer"]
            if result.get("citation_map"):
                state["citation_map"] = result["citation_map"]
            if result.get("faithfulness"):
                state["faithfulness"] = result["faithfulness"]
            if result.get("fallback_used"):
                state["fallback_used"] = True
            if result.get("channel"):
                state["channel"] = result["channel"]
            if result.get("steps"):
                state["steps"] = result["steps"]
            if result.get("query") and pattern_name in ("conv_rag", "hyde", "query_rewrite"):
                state["query"] = result["query"]
        except Exception as e:
            # Pattern failure → continue with what we have
            pass

    # Rerank final chunks
    if state["chunks"]:
        state["chunks"] = rerank(query, state["chunks"], top_n=5)

    # Build context for synthesis
    context = "\n\n".join([
        f"[Source: {c['metadata'].get('source','?')}]\n{c['content']}"
        for c in state["chunks"][:5]
    ]) if state["chunks"] else "No relevant documents found."

    # Synthesize if no answer yet
    if not state["answer"]:
        # Inject agentic steps into context if available
        if state.get("steps"):
            steps_ctx = "\n".join([f"Step: {s['step']}\nAnswer: {s['answer']}" for s in state["steps"]])
            context = f"Multi-step reasoning:\n{steps_ctx}\n\n{context}"
        language = analysis.get("language", "English")
        state["answer"] = synthesize(context, query, language=language)

    # Grade the answer
    grade_result = grade(state["answer"], context, query)
    quality = grade_result.get("quality_score", 0.5)

    # Faithfulness — run self_rag verification if not already done
    faithfulness = state["faithfulness"]
    citation_map = state["citation_map"]
    if "self_rag" in patterns and not citation_map:
        from src.generation.llm import check_faithfulness
        faith = check_faithfulness(state["answer"], state["chunks"])
        citation_map = faith.get("citation_map", {})
        faithfulness = "pass" if faith.get("all_supported", True) else "warn"

    # Follow-up suggestions
    followups = []
    try:
        followups = generate_followups(query, state["answer"])
    except Exception:
        pass

    latency_ms = int((time.time() - start_time) * 1000)

    # Write memory
    write_turn(session_id, analysis["turn"], query, state["query"], state["answer"])
    write_performance(patterns, analysis.get("query_class", "general"), quality, latency_ms, 0)

    if quality >= 0.85 and faithfulness == "pass":
        write_verified_knowledge(fingerprint, state["answer"], quality, [c["metadata"].get("source","") for c in state["chunks"]])

    # Build citation map from chunks for display
    if not citation_map and state["chunks"]:
        citation_map = {
            str(i): {"source": c["metadata"].get("source", "?"), "score": c.get("score", 0)}
            for i, c in enumerate(state["chunks"])
        }

    return RAGAgentResponse(
        answer_text=state["answer"],
        citation_map=citation_map,
        quality_score=quality,
        faithfulness=faithfulness,
        patterns_used=patterns,
        latency_ms=latency_ms,
        retrieval_channel=state["channel"],
        fallback_used=state["fallback_used"],
        verified_knowledge_hit=False,
        suggested_followups=followups,
        memory_write={"session_id": session_id, "turn": analysis["turn"]},
    )
