import json
from src.patterns.base import BasePattern
from src.retrieval.reranker import reciprocal_rank_fusion


class RAGFusion(BasePattern):
    name = "rag_fusion"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        raw = self._llm_call(
            system='Generate 4 diverse query variants that approach the same question from different angles. Return as JSON array of strings.',
            human=f"Original query: {query}",
            temperature=0.4,
        )
        try:
            start = raw.find("["); end = raw.rfind("]") + 1
            variants = json.loads(raw[start:end])
        except Exception:
            variants = [query]

        all_results = [self._retrieve(v) for v in [query] + variants[:4]]
        merged = reciprocal_rank_fusion(all_results)
        return {"query": query, "variants": variants, "chunks": merged, "channel": "vector"}
