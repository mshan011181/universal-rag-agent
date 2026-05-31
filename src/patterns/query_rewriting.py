import json
from src.patterns.base import BasePattern
from src.retrieval.reranker import reciprocal_rank_fusion


class QueryRewriting(BasePattern):
    name = "query_rewrite"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        raw = self._llm_call(
            system='Rewrite the user query into 3 cleaner, more specific versions. Return as JSON array of strings only.',
            human=f"Original query: {query}",
        )
        try:
            start = raw.find("["); end = raw.rfind("]") + 1
            variants = json.loads(raw[start:end])
        except Exception:
            variants = [query]

        all_results = []
        for v in variants[:3]:
            all_results.append(self._retrieve(v))

        merged = reciprocal_rank_fusion(all_results)
        return {"query": query, "rewritten_variants": variants, "chunks": merged, "channel": "vector"}
