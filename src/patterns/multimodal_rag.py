from src.patterns.base import BasePattern


class MultiModalRAG(BasePattern):
    name = "multimodal_rag"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        # Text retrieval (CLIP/image embeddings would extend this)
        chunks = self._retrieve(query)
        note = {
            "content": "[Multi-Modal RAG] Image/chart analysis requires CLIP embeddings. Text-based retrieval is active.",
            "metadata": {"source": "system_note"},
            "score": 0.5,
        }
        return {"query": query, "chunks": chunks + [note], "channel": "mixed"}
