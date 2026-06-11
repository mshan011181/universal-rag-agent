"""Tests for the 5-dimension query analyzer."""

from unittest.mock import patch
from src.query_analyzer import fingerprint


# ── Fingerprint ────────────────────────────────────────────────────────────────
def test_fingerprint_deterministic():
    assert fingerprint("What is RAG?") == fingerprint("What is RAG?")


def test_fingerprint_different_queries():
    assert fingerprint("What is RAG?") != fingerprint("What is ChromaDB?")


def test_fingerprint_case_insensitive():
    assert fingerprint("what is rag?") == fingerprint("WHAT IS RAG?")


def test_fingerprint_length():
    assert len(fingerprint("test")) == 16


# ── analyze_query — pattern selection ─────────────────────────────────────────
def _analyze(query, llm_response, history=None):
    """Helper: patch LLM + history then call analyze_query."""
    with patch("src.query_analyzer.safe_invoke", return_value=llm_response), \
         patch("src.query_analyzer.get_history", return_value=history or []):
        from src.query_analyzer import analyze_query
        return analyze_query(query, "test-session")


_SIMPLE = ('{"ambiguity": "low", "complexity": "simple", "data_type": "text", '
           '"domain_risk": false, "has_multi_angles": false, "query_class": "factual"}')

_HIGH_RISK = ('{"ambiguity": "low", "complexity": "simple", "data_type": "text", '
              '"domain_risk": true, "has_multi_angles": false, "query_class": "factual"}')

_MULTI_ANGLE = ('{"ambiguity": "high", "complexity": "complex", "data_type": "text", '
                '"domain_risk": false, "has_multi_angles": true, "query_class": "research"}')

_ENTITY = ('{"ambiguity": "low", "complexity": "simple", "data_type": "entity", '
           '"domain_risk": false, "has_multi_angles": false, "query_class": "factual"}')

_IMAGE = ('{"ambiguity": "low", "complexity": "simple", "data_type": "image", '
          '"domain_risk": false, "has_multi_angles": false, "query_class": "factual"}')


def test_short_query_triggers_hyde():
    result = _analyze("DB", _SIMPLE)
    assert "hyde" in result["patterns"]


def test_long_query_triggers_flare():
    long_q = " ".join(["word"] * 55)
    result = _analyze(long_q, _SIMPLE)
    assert "flare" in result["patterns"]


def test_domain_risk_adds_crag_and_self_rag():
    result = _analyze("What are HIPAA compliance requirements?", _HIGH_RISK)
    assert "crag" in result["patterns"]
    assert "self_rag" in result["patterns"]


def test_high_ambiguity_adds_query_rewrite():
    result = _analyze("Tell me about that thing", _MULTI_ANGLE)
    assert "query_rewrite" in result["patterns"]


def test_multi_angle_adds_rag_fusion():
    result = _analyze("Compare all RAG patterns and their tradeoffs", _MULTI_ANGLE)
    assert "rag_fusion" in result["patterns"]


def test_entity_data_type_adds_graph_rag():
    result = _analyze("Who founded OpenAI?", _ENTITY)
    assert "graph_rag" in result["patterns"]


def test_image_data_type_adds_multimodal_rag():
    result = _analyze("What does this chart show?", _IMAGE)
    assert "multimodal_rag" in result["patterns"]


def test_pronouns_add_query_rewrite():
    result = _analyze("What did they decide about it?", _SIMPLE)
    assert "query_rewrite" in result["patterns"]


def test_conversation_history_adds_conv_rag():
    fake_history = [{"role": "user", "content": "prev question"}]
    result = _analyze("Follow-up question", _SIMPLE, history=fake_history)
    assert "conv_rag" in result["patterns"]


def test_no_duplicate_patterns():
    result = _analyze("What are the HIPAA legal compliance rules for data?", _HIGH_RISK)
    assert len(result["patterns"]) == len(set(result["patterns"]))


def test_result_contains_all_fields():
    result = _analyze("What is RAG?", _SIMPLE)
    for field in ("query", "fingerprint", "word_count", "turn", "length_signal",
                  "ambiguity", "complexity", "patterns", "history"):
        assert field in result


def test_bad_llm_json_uses_defaults():
    result = _analyze("What is RAG?", "this is not json at all")
    assert isinstance(result["patterns"], list)
    assert len(result["patterns"]) > 0


def test_simple_query_always_has_retrieval_pattern():
    result = _analyze("What is RAG?", _SIMPLE)
    retrieval = {"naive_rag", "hyde", "crag", "agentic_rag", "rag_fusion", "flare", "speculative_rag"}
    assert any(p in retrieval for p in result["patterns"])
