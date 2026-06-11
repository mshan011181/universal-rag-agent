"""
Tests for the LLM provider abstraction (Groq / Vertex AI switching).
"""

import os
from unittest.mock import MagicMock, patch


def test_get_llm_returns_groq_by_default():
    os.environ["LLM_PROVIDER"] = "groq"
    with patch("langchain_groq.ChatGroq") as mock_groq:
        mock_groq.return_value = MagicMock()
        import src.generation.llm as llm_module
        llm_module.get_llm()
        mock_groq.assert_called_once()


def test_get_llm_returns_vertexai_when_set(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "vertexai")
    monkeypatch.setenv("VERTEXAI_PROJECT", "test-project")

    with patch("langchain_google_vertexai.ChatVertexAI") as mock_vertex:
        mock_vertex.return_value = MagicMock()
        import src.generation.llm as llm_module
        llm_module.get_llm()
        mock_vertex.assert_called_once()


def test_synthesize_returns_string(mock_llm):
    from src.generation.llm import synthesize
    result = synthesize("Some context text.", "What is RAG?")
    assert isinstance(result, str)


def test_grade_returns_quality_score(mock_llm):
    from src.generation.llm import grade
    result = grade(
        answer="RAG is retrieval-augmented generation.",
        context="RAG stands for retrieval-augmented generation.",
        query="What is RAG?",
    )
    assert "quality_score" in result
    assert 0.0 <= result["quality_score"] <= 1.0


def test_grade_returns_all_dimensions(mock_llm):
    from src.generation.llm import grade
    result = grade("answer", "context", "query")
    for key in ("relevance", "completeness", "hallucination_risk"):
        assert key in result


def test_grade_no_info_penalty(mock_llm):
    """Answers that say 'no relevant information' should be capped at 0.3."""
    mock_llm.invoke.return_value = MagicMock(
        content='{"relevance": 0.9, "completeness": 0.9, "hallucination_risk": 0.0, "reasoning": "ok"}'
    )
    from src.generation.llm import grade
    result = grade(
        answer="There is no relevant information in the context.",
        context="context",
        query="query",
    )
    assert result["quality_score"] <= 0.3


def test_grade_handles_bad_json(mock_llm):
    """If the LLM returns garbage JSON, grade must return safe defaults."""
    mock_llm.invoke.return_value = MagicMock(content="sorry, I cannot grade this")
    from src.generation.llm import grade
    result = grade("answer", "context", "query")
    assert result["quality_score"] == 0.5


def test_check_faithfulness_returns_dict(mock_llm):
    from src.generation.llm import check_faithfulness
    chunks = [{"content": "RAG is retrieval augmented generation."}]
    result = check_faithfulness("RAG is retrieval augmented generation.", chunks)
    assert isinstance(result, dict)
    assert "all_supported" in result


def test_generate_followups_returns_list(mock_llm):
    mock_llm.invoke.return_value = MagicMock(
        content='["What are the benefits of RAG?", "How does RAG differ from fine-tuning?", "What is CRAG?"]'
    )
    from src.generation.llm import generate_followups
    result = generate_followups("What is RAG?", "RAG is retrieval-augmented generation.")
    assert isinstance(result, list)


def test_generate_followups_handles_bad_json(mock_llm):
    mock_llm.invoke.return_value = MagicMock(content="I cannot generate followups.")
    from src.generation.llm import generate_followups
    result = generate_followups("query", "answer")
    assert result == []


def test_safe_invoke_retries_on_failure():
    """safe_invoke should retry up to 3 times before re-raising."""
    failing_llm = MagicMock()
    failing_llm.invoke.side_effect = [Exception("timeout"), Exception("timeout"), MagicMock(content="ok")]
    from src.generation.llm import safe_invoke
    from langchain_core.messages import HumanMessage
    result = safe_invoke(failing_llm, [HumanMessage(content="hello")])
    assert result == "ok"
    assert failing_llm.invoke.call_count == 3
