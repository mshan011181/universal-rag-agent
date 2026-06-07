import json
from src.patterns.base import BasePattern
from src.retrieval.web_search import web_search


class CRAG(BasePattern):
    name = "crag"

    def run(self, query: str, analysis: dict, chunks: list[dict] = None, **kwargs) -> dict:
        if chunks is None:
            chunks = self._retrieve(query, namespace=analysis.get('namespace', 'default'))

        graded, fallback_used, channel = self._grade_and_filter(query, chunks)
        return {"query": query, "chunks": graded, "fallback_used": fallback_used, "channel": channel}

    def _grade_and_filter(self, query: str, chunks: list[dict]) -> tuple:
        if not chunks:
            web = web_search(query)
            return web, bool(web), "web"

        llm_system = (
            'Grade each retrieved chunk as "relevant", "irrelevant", or "ambiguous" '
            'for answering the query. Return JSON: {"grades": ["relevant"|"irrelevant"|"ambiguous", ...]}'
        )
        context_preview = "\n".join([f"[{i}] {c['content'][:200]}" for i, c in enumerate(chunks)])
        raw = self._llm_call(system=llm_system, human=f"Query: {query}\n\nChunks:\n{context_preview}", temperature=0.0)

        try:
            start = raw.find("{"); end = raw.rfind("}") + 1
            grades_data = json.loads(raw[start:end])
            grades = grades_data.get("grades", ["relevant"] * len(chunks))
        except Exception:
            grades = ["relevant"] * len(chunks)

        relevant = [c for c, g in zip(chunks, grades) if g == "relevant"]
        ambiguous = [c for c, g in zip(chunks, grades) if g == "ambiguous"]

        if relevant:
            return relevant + ambiguous, False, "vector"

        # All irrelevant → web fallback
        web = web_search(query)
        if web:
            return web, True, "web"

        return ambiguous or chunks, False, "vector"
