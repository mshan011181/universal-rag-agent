import re
import time
from src.patterns.bi_rag import BIRag
from src.patterns.cross_rag import CrossRag
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
from src.generation.llm import synthesize, synthesize_cross, grade, generate_followups
from src.retrieval.reranker import rerank, hybrid_rerank
from src.retrieval.vector_store import retrieve_by_source, sign_figure_urls
from src.models import RAGAgentResponse
from src.memory.sqlite_store import (
    write_turn, write_performance, write_verified_knowledge,
    check_verified_knowledge, purge_stale_cache
)

PATTERN_MAP = {
    "bi_rag": BIRag(),
    "cross_rag": CrossRag(),
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
    # Auto-purge stale / low-quality cache entries on every query.
    # This is a fast single-statement DELETE (microseconds) so it adds
    # no measurable latency but prevents wrong answers from accumulating.
    purge_stale_cache(min_quality=0.85)

    start_time = time.time()
    query = analysis["query"]
    patterns = analysis["patterns"]
    language = analysis.get("language", "English")
    model_override: str | None = analysis.get("model_override")

    # Fingerprint includes language AND model so each (question, language, model)
    # gets its own cache slot — selecting Claude won't return a cached Groq
    # answer, and vice-versa. English variants share one language slot.
    import hashlib as _hashlib
    _fp_base = analysis["fingerprint"]
    _lang_key = language.lower().strip()
    _ENGLISH_VARIANTS = {"english", "american english", "british english", "australian english"}
    _lang_norm = "english" if _lang_key in _ENGLISH_VARIANTS else _lang_key
    _model_key = (model_override or "default").lower().strip()
    fingerprint = _hashlib.md5(f"{_fp_base}:{_lang_norm}:{_model_key}".encode(), usedforsecurity=False).hexdigest()[:16]

    # Check verified knowledge cache — skipped when the caller forces a fresh
    # answer (no_cache), so the same question can be re-run on demand.
    no_cache = bool(analysis.get("no_cache"))
    cached = None if no_cache else check_verified_knowledge(fingerprint)
    if cached:
        try:
            cache_followups = generate_followups(query, cached, model_override=model_override)
        except Exception:
            cache_followups = []
        return RAGAgentResponse(
            answer_text=cached,
            quality_score=0.9,
            faithfulness="pass",
            confidence="HIGH",
            patterns_used=["cache_hit"],
            latency_ms=0,
            retrieval_channel="cache",
            verified_knowledge_hit=True,
            suggested_followups=cache_followups,
        )

    namespace = analysis.get("namespace", "default")

    # --- Source filter mode (user selected specific files via UI checkbox) ---
    # When source_filters is set, skip all broad semantic patterns and fetch
    # ONLY from the selected files. This eliminates cross-document hallucination.
    source_filters: list[str] = analysis.get("source_filters", [])
    if source_filters:
        filtered_chunks: list[dict] = []
        for fname in source_filters:
            chunks = retrieve_by_source(fname, namespace=namespace)
            filtered_chunks.extend(chunks)
        if filtered_chunks:
            # Rerank within the selected sources only, then synthesize directly
            reranked = rerank(query, filtered_chunks, top_n=10)
            MIN_SCORE = 0.30  # lower threshold — user explicitly chose this file
            state_chunks = [c for c in reranked if c.get("score", 0) >= MIN_SCORE] or reranked[:5]
            context = "\n\n".join([
                f"[Source: {c['metadata'].get('source','?')}]\n{c['content']}"
                for c in state_chunks[:6]
            ])
            answer = synthesize(context, query, language=language, model_override=model_override)
            grade_result = grade(answer, context, query, model_override=model_override)
            quality = grade_result.get("quality_score", 0.5)
            followups = []
            try:
                followups = generate_followups(query, answer, model_override=model_override)
            except Exception:
                pass
            citation_map = {
                str(i): {"source": c["metadata"].get("source", "?"), "score": c.get("score", 0)}
                for i, c in enumerate(state_chunks[:6])
            }
            _sf_figs: list[str] = []
            for c in state_chunks[:6]:
                _sf_figs.extend(c.get("metadata", {}).get("figures", []) or [])
            sf_figure_urls = sign_figure_urls(_sf_figs) if _sf_figs else []
            latency_ms = int((time.time() - start_time) * 1000)
            write_turn(session_id, analysis["turn"], query, query, answer)
            write_performance(["source_filter"], analysis.get("query_class", "general"), quality, latency_ms, 0)
            return RAGAgentResponse(
                answer_text=answer,
                citation_map=citation_map,
                quality_score=quality,
                faithfulness="pass",
                patterns_used=["source_filter"],
                latency_ms=latency_ms,
                retrieval_channel="vector",
                fallback_used=False,
                verified_knowledge_hit=False,
                suggested_followups=followups,
                figures=sf_figure_urls,
                memory_write={"session_id": session_id, "turn": analysis["turn"]},
            )

    # --- Filename-aware pre-fetch ---
    # If the query mentions a specific file (e.g. "invoice2.jpg"), retrieve
    # all stored chunks for that file via metadata filter so RAG has the right
    # content regardless of semantic distance.
    _FILE_EXT_RE = re.compile(
        r'\b([\w\-. ()]+\.(jpg|jpeg|png|gif|bmp|webp|pdf|docx?|xlsx?|csv|'
        r'txt|mp3|mp4|wav|webm|mov|avi|mkv|flac|m4a|ogg))\b',
        re.IGNORECASE,
    )
    _source_seeded_chunks: list[dict] = []
    for m in _FILE_EXT_RE.finditer(query):
        fname = m.group(1).strip()
        fetched = retrieve_by_source(fname, namespace=namespace)
        if fetched:
            _source_seeded_chunks.extend(fetched)

    state = {
        "query": query,
        "chunks": _source_seeded_chunks,  # pre-seed with filename-matched chunks
        "answer": None,
        "citation_map": {},
        "faithfulness": "pass",
        "fallback_used": False,
        "channel": "vector",
        "steps": [],
        "cross_sources": [],  # populated by cross_rag when 2+ sources retrieved
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
            if result.get("cross_sources"):
                state["cross_sources"] = result["cross_sources"]
            if result.get("query") and pattern_name in ("conv_rag", "hyde", "query_rewrite"):
                state["query"] = result["query"]

            # BI RAG short-circuit: if bi_rag computed an answer,
            # skip all remaining patterns and return immediately.
            if pattern_name == "bi_rag" and state.get("answer"):
                latency_ms = int((time.time() - start_time) * 1000)
                write_turn(session_id, analysis["turn"], query, query, state["answer"])
                write_performance(["bi_rag"], analysis.get("query_class", "factual"), 0.9, latency_ms, 0)
                return RAGAgentResponse(
                    answer_text=state["answer"],
                    citation_map={},
                    quality_score=0.9,
                    faithfulness="pass",
                    patterns_used=["bi_rag"],
                    latency_ms=latency_ms,
                    retrieval_channel="bi_computation",
                    fallback_used=False,
                    verified_knowledge_hit=False,
                    suggested_followups=[],
                    memory_write={"session_id": session_id, "turn": analysis["turn"]},
                )
        except Exception:
            # Pattern failure → continue with what we have
            pass

    # Two-stage always-on re-ranking for quality at scale (1000s of docs):
    #  1. hybrid (dense + BM25) over the candidate set → recall, keyword precision
    #  2. Cohere cross-encoder → precision ordering (no-op if COHERE_API_KEY unset)
    # Both degrade gracefully, so behaviour is unchanged without the deps/key.
    if state["chunks"]:
        reranked = hybrid_rerank(query, state["chunks"], top_n=15, alpha=0.7)
        reranked = rerank(query, reranked, top_n=15)

        # ── Relevance threshold filter ───────────────────────────────────
        # Cohere reranker scores are in [0,1]: a strong topical match scores
        # high, an unrelated chunk scores near zero. Prefer strong matches;
        # when none exist, keep only chunks that clear an abstain floor. If
        # NOTHING clears it, feed no context so the model grounds out with
        # "no relevant content" instead of answering a maths question from a
        # physics document (cross-topic mixing).
        MIN_SCORE = 0.45
        ABSTAIN_FLOOR = 0.25
        above = [c for c in reranked if c.get("score", 0) >= MIN_SCORE]
        if above:
            filtered = above
        else:
            filtered = [c for c in reranked if c.get("score", 0) >= ABSTAIN_FLOOR][:3]

        # ── Per-source chunk cap ─────────────────────────────────────────
        # If all retrieved chunks come from a single source (e.g. one large
        # Wikipedia page), allow up to 6 chunks so different sections of
        # that page (infobox + performance table) can both appear in context.
        # When multiple sources are present, cap at 3 each to prevent a large
        # document from crowding out the others.
        unique_sources = {c["metadata"].get("source", "?") for c in filtered}
        per_src_cap = 6 if len(unique_sources) == 1 else 3
        total_cap = 8 if len(unique_sources) == 1 else 5

        source_counts: dict[str, int] = {}
        capped: list[dict] = []
        for chunk in filtered:
            src = chunk["metadata"].get("source", "?")
            if source_counts.get(src, 0) < per_src_cap:
                capped.append(chunk)
                source_counts[src] = source_counts.get(src, 0) + 1
            if len(capped) >= total_cap:
                break
        state["chunks"] = capped

    # Build context for synthesis — compress each chunk to its most relevant
    # sentences before sending to the LLM (reduces noise and token cost).
    # Tabular chunks (spreadsheet rows) are not compressed to preserve data integrity.
    def _ctx_content(c: dict) -> str:
        # No trimming for ANY document: send the full retrieved chunk to the LLM.
        # Sentence compression was dropping solution steps, results, and detail
        # (worst on STEM/worked examples, but it reduced fidelity everywhere).
        # Reranking + the per-source/total chunk caps already bound context size.
        return c["content"]

    context = "\n\n".join([
        f"[Source: {c['metadata'].get('source','?')}]\n{_ctx_content(c)}"
        for c in state["chunks"]
    ]) if state["chunks"] else "No relevant documents found."

    _non_english = language and language.lower() not in (
        "english", "american english", "british english", "australian english"
    )

    # Synthesize if no answer yet, OR if a non-English language is requested and
    # a pattern produced an English answer (e.g. SelfRAG always answers in English).
    if not state["answer"] or _non_english:
        # Inject agentic steps into context if available
        if state.get("steps"):
            steps_ctx = "\n".join([f"Step: {s['step']}\nAnswer: {s['answer']}" for s in state["steps"]])
            context = f"Multi-step reasoning:\n{steps_ctx}\n\n{context}"

        # Use cross-document synthesis prompt when 2+ sources are in context
        if state.get("cross_sources") and len(state["cross_sources"]) >= 2:
            state["answer"] = synthesize_cross(
                context, query,
                sources=state["cross_sources"],
                language=language,
                model_override=model_override,
            )
        else:
            state["answer"] = synthesize(context, query, language=language, model_override=model_override)

    # Grade the answer
    grade_result = grade(state["answer"], context, query, model_override=model_override)
    quality = grade_result.get("quality_score", 0.5)

    # Faithfulness — run self_rag verification if not already done
    faithfulness = state["faithfulness"]
    citation_map = state["citation_map"]
    if "self_rag" in patterns and not citation_map:
        from src.generation.llm import check_faithfulness
        faith = check_faithfulness(state["answer"], state["chunks"], model_override=model_override)
        citation_map = faith.get("citation_map", {})
        faithfulness = "pass" if faith.get("all_supported", True) else "warn"

    # Follow-up suggestions
    followups = []
    try:
        followups = generate_followups(query, state["answer"], model_override=model_override)
    except Exception:
        pass

    latency_ms = int((time.time() - start_time) * 1000)

    # Collect figures from the retrieved chunks (Marker-extracted) and sign them
    # for display. Empty unless STEM docs with figures are in the answer context.
    _figure_objs: list[str] = []
    for c in state["chunks"]:
        _figure_objs.extend(c.get("metadata", {}).get("figures", []) or [])
    figure_urls = sign_figure_urls(_figure_objs) if _figure_objs else []

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
        figures=figure_urls,
        memory_write={"session_id": session_id, "turn": analysis["turn"]},
    )
