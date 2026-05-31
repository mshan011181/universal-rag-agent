import json
from src.patterns.base import BasePattern
from src.generation.llm import check_faithfulness


class SelfRAG(BasePattern):
    name = "self_rag"

    def run(self, query: str, analysis: dict, chunks: list[dict] = None, answer: str = None, **kwargs) -> dict:
        if chunks is None:
            chunks = self._retrieve(query)

        if answer is None:
            context = "\n\n".join([c["content"] for c in chunks])
            answer = self._llm_call(
                system="Answer only from the provided context. Do not use prior knowledge.",
                human=f"Context:\n{context}\n\nQuestion: {query}",
            )

        faith_result = check_faithfulness(answer, chunks)
        all_supported = faith_result.get("all_supported", True)
        citation_map = faith_result.get("citation_map", {})

        faithfulness = "pass" if all_supported else "warn"

        return {
            "query": query,
            "chunks": chunks,
            "answer": answer,
            "citation_map": citation_map,
            "faithfulness": faithfulness,
            "channel": "vector",
        }
