from src.patterns.base import BasePattern


class NaiveRAG(BasePattern):
    name = "naive_rag"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        chunks = self._retrieve(query)
        return {"query": query, "chunks": chunks, "channel": "vector"}
