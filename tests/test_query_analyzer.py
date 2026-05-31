import pytest
from unittest.mock import patch, MagicMock
from src.query_analyzer import fingerprint


def test_fingerprint_deterministic():
    f1 = fingerprint("What is RAG?")
    f2 = fingerprint("What is RAG?")
    assert f1 == f2


def test_fingerprint_different_queries():
    f1 = fingerprint("What is RAG?")
    f2 = fingerprint("What is ChromaDB?")
    assert f1 != f2


def test_fingerprint_case_insensitive():
    f1 = fingerprint("what is rag?")
    f2 = fingerprint("WHAT IS RAG?")
    assert f1 == f2


@patch("src.query_analyzer.safe_invoke")
@patch("src.query_analyzer.get_history", return_value=[])
def test_analyze_short_query_triggers_hyde(mock_history, mock_llm):
    mock_llm.return_value = '{"ambiguity": "low", "complexity": "simple", "data_type": "text", "domain_risk": false, "has_multi_angles": false, "query_class": "factual"}'
    from src.query_analyzer import analyze_query
    result = analyze_query("DB", "test-session")
    assert "hyde" in result["patterns"]


@patch("src.query_analyzer.safe_invoke")
@patch("src.query_analyzer.get_history", return_value=[])
def test_analyze_domain_risk_adds_crag_selfrag(mock_history, mock_llm):
    mock_llm.return_value = '{"ambiguity": "low", "complexity": "simple", "data_type": "text", "domain_risk": true, "has_multi_angles": false, "query_class": "factual"}'
    from src.query_analyzer import analyze_query
    result = analyze_query("What are HIPAA compliance rules?", "test-session")
    assert "crag" in result["patterns"]
    assert "self_rag" in result["patterns"]
