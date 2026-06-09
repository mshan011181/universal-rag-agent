import re
from src.config import COHERE_API_KEY


def rerank(query: str, chunks: list[dict], top_n: int = 5) -> list[dict]:
    if COHERE_API_KEY and chunks:
        try:
            import cohere
            co = cohere.Client(COHERE_API_KEY)
            docs = [c["content"] for c in chunks]
            response = co.rerank(query=query, documents=docs, top_n=top_n, model="rerank-english-v3.0")
            reranked = []
            for r in response.results:
                chunk = chunks[r.index].copy()
                chunk["score"] = round(r.relevance_score, 4)
                reranked.append(chunk)
            return reranked
        except Exception:
            pass
    return sorted(chunks, key=lambda x: x.get("score", 0), reverse=True)[:top_n]


def hybrid_rerank(query: str, chunks: list[dict], top_n: int = 15, alpha: float = 0.7) -> list[dict]:
    """Hybrid BM25 + dense re-ranking.

    Combines dense (semantic) scores already stored in each chunk with a
    BM25 keyword score computed locally on the retrieved set.

    Args:
        alpha: Weight for dense score. (1 - alpha) is given to BM25.
               alpha=0.7 → 70% semantic, 30% keyword. Tune per use case.

    Falls back to pure dense ranking if rank-bm25 is not installed.
    """
    if not chunks:
        return chunks

    try:
        from rank_bm25 import BM25Okapi

        tokenized_corpus = [c["content"].lower().split() for c in chunks]
        tokenized_query = query.lower().split()

        bm25 = BM25Okapi(tokenized_corpus)
        bm25_scores = bm25.get_scores(tokenized_query)

        max_bm25 = float(max(bm25_scores)) if max(bm25_scores) > 0 else 1.0

        scored = []
        for i, chunk in enumerate(chunks):
            dense = chunk.get("score", 0.0)
            bm25_norm = float(bm25_scores[i]) / max_bm25
            hybrid = round(alpha * dense + (1.0 - alpha) * bm25_norm, 4)
            c = chunk.copy()
            c["score"] = hybrid
            c["dense_score"] = round(dense, 4)
            c["bm25_score"] = round(bm25_norm, 4)
            scored.append(c)

        return sorted(scored, key=lambda x: x["score"], reverse=True)[:top_n]

    except ImportError:
        # rank-bm25 not installed — degrade gracefully to dense-only
        return sorted(chunks, key=lambda x: x.get("score", 0), reverse=True)[:top_n]


def compress_chunk(query: str, content: str, max_sentences: int = 4) -> str:
    """Context compression: keep only the most query-relevant sentences.

    Splits the chunk into sentences, scores each by query-word overlap,
    returns the top-scoring sentences in their original order.
    Chunks with <= max_sentences are returned unchanged.
    """
    sentences = re.split(r'(?<=[.!?])\s+', content.strip())
    if len(sentences) <= max_sentences:
        return content

    query_tokens = set(query.lower().split())

    def _score(s: str) -> int:
        return len(query_tokens & set(s.lower().split()))

    ranked = sorted(range(len(sentences)), key=lambda i: _score(sentences[i]), reverse=True)
    top_indices = sorted(ranked[:max_sentences])           # preserve original order
    return " ".join(sentences[i] for i in top_indices)


def reciprocal_rank_fusion(result_lists: list[list[dict]], k: int = 60) -> list[dict]:
    scores: dict[str, float] = {}
    chunk_map: dict[str, dict] = {}
    for result_list in result_lists:
        for rank, chunk in enumerate(result_list):
            key = chunk["content"][:100]
            scores[key] = scores.get(key, 0) + 1.0 / (k + rank + 1)
            chunk_map[key] = chunk
    sorted_keys = sorted(scores, key=lambda x: scores[x], reverse=True)
    return [chunk_map[k] for k in sorted_keys]
