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
