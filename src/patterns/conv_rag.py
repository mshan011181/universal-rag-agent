from src.patterns.base import BasePattern


class ConvRAG(BasePattern):
    name = "conv_rag"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        history = analysis.get("history", [])
        if not history:
            chunks = self._retrieve(query)
            return {"query": query, "chunks": chunks, "channel": "vector"}

        history_text = "\n".join([f"Turn {h['turn']}: Q: {h['query']} A: {h['answer']}" for h in history[-3:]])
        rewritten = self._llm_call(
            system="Rewrite the current query as a fully self-contained question by resolving any pronoun references using the conversation history. Return only the rewritten query.",
            human=f"Conversation history:\n{history_text}\n\nCurrent query: {query}",
        )
        chunks = self._retrieve(rewritten.strip())
        return {"query": rewritten.strip(), "original_query": query, "chunks": chunks, "channel": "vector"}
