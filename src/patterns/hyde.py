from src.patterns.base import BasePattern


class HyDE(BasePattern):
    name = "hyde"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        hypothetical = self._llm_call(
            system="Generate a detailed hypothetical document passage that would answer the following query. Write 2-3 paragraphs as if from an expert reference document.",
            human=f"Query: {query}",
            temperature=0.3,
        )
        chunks = self._retrieve(hypothetical, namespace=analysis.get('namespace', 'default'))
        return {"query": hypothetical, "original_query": query, "chunks": chunks, "channel": "vector"}
