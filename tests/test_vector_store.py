"""
Unit tests for the Pinecone-backed vector store.

The Pinecone client and SentenceTransformer embedder are both mocked by
conftest.py so no network calls or model downloads happen.
"""

import pytest
from unittest.mock import patch


def test_retrieve_returns_list(mock_pinecone):
    from src.retrieval.vector_store import retrieve
    results = retrieve("What is RAG?")
    assert isinstance(results, list)


def test_retrieve_result_shape(mock_pinecone):
    from src.retrieval.vector_store import retrieve
    results = retrieve("What is RAG?")
    assert len(results) > 0
    chunk = results[0]
    assert "content" in chunk
    assert "metadata" in chunk
    assert "score" in chunk


def test_retrieve_score_is_float(mock_pinecone):
    from src.retrieval.vector_store import retrieve
    results = retrieve("What is RAG?")
    assert isinstance(results[0]["score"], float)


def test_retrieve_content_is_string(mock_pinecone):
    from src.retrieval.vector_store import retrieve
    results = retrieve("test query")
    assert isinstance(results[0]["content"], str)


def test_retrieve_respects_namespace(mock_pinecone):
    from src.retrieval.vector_store import retrieve
    retrieve("query", namespace="enterprise_a")
    call_kwargs = mock_pinecone.query.call_args.kwargs
    assert call_kwargs["namespace"] == "enterprise_a"


def test_retrieve_respects_k(mock_pinecone):
    from src.retrieval.vector_store import retrieve
    # retrieve over-fetches candidates (for section/formula re-ranking) then
    # trims to k, so the index is queried with top_k >= k and the returned
    # result count never exceeds k.
    results = retrieve("query", k=3)
    call_kwargs = mock_pinecone.query.call_args.kwargs
    assert call_kwargs["top_k"] >= 3
    assert len(results) <= 3


def test_ingest_text_calls_upsert(mock_pinecone):
    from src.retrieval.vector_store import ingest_text
    count = ingest_text("This is a test document about RAG systems.", source="test")
    mock_pinecone.upsert.assert_called_once()
    assert count > 0


def test_ingest_text_empty_returns_zero(mock_pinecone):
    from src.retrieval.vector_store import ingest_text
    count = ingest_text("", source="empty")
    assert count == 0


def test_ingest_text_uses_namespace(mock_pinecone):
    from src.retrieval.vector_store import ingest_text
    ingest_text("Some content here.", source="doc", namespace="tenant_xyz")
    call_kwargs = mock_pinecone.upsert.call_args.kwargs
    assert call_kwargs["namespace"] == "tenant_xyz"


def test_collection_count_returns_int(mock_pinecone):
    from src.retrieval.vector_store import collection_count
    count = collection_count()
    assert isinstance(count, int)
    assert count == 42


def test_collection_count_handles_error():
    from src.retrieval.vector_store import collection_count
    with patch("src.retrieval.vector_store._get_index", side_effect=Exception("connection failed")):
        # Reset cached index so _get_index is called fresh
        import src.retrieval.vector_store as vs
        vs._index = None
        count = collection_count()
    assert count == 0


def test_ingest_file_unsupported_type(mock_pinecone, tmp_path):
    from src.retrieval.vector_store import ingest_file
    bad_file = tmp_path / "file.xyz"
    bad_file.write_text("unsupported content")
    with pytest.raises(ValueError, match="Unsupported file type"):
        ingest_file(str(bad_file))


def test_ingest_file_txt(mock_pinecone, tmp_path):
    from src.retrieval.vector_store import ingest_file
    txt = tmp_path / "sample.txt"
    txt.write_text("This is a sample document about retrieval-augmented generation.")
    count = ingest_file(str(txt))
    assert count >= 1
    mock_pinecone.upsert.assert_called_once()
