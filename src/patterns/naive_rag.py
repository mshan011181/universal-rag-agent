from src.patterns.base import BasePattern


class NaiveRAG(BasePattern):
    name = "naive_rag"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        namespace = analysis.get("namespace", "default")
        chunks = self._retrieve(query, namespace=namespace)
        return {"query": query, "chunks": chunks, "channel": "vector"}
