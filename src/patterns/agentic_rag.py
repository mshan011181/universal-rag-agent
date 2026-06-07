import json
from src.patterns.base import BasePattern


class AgenticRAG(BasePattern):
    name = "agentic_rag"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        plan_raw = self._llm_call(
            system='Break this complex query into 2-4 sequential sub-questions that must be answered in order. Return as JSON array of strings.',
            human=f"Query: {query}",
        )
        try:
            start = plan_raw.find("["); end = plan_raw.rfind("]") + 1
            steps = json.loads(plan_raw[start:end])
        except Exception:
            steps = [query]

        all_chunks = []
        step_answers = []
        running_context = ""

        for step in steps[:4]:
            enriched = f"{step}\n\nContext so far: {running_context}" if running_context else step
            chunks = self._retrieve(enriched, namespace=analysis.get('namespace', 'default'))
            all_chunks.extend(chunks)
            context = "\n\n".join([c["content"] for c in chunks])
            step_ans = self._llm_call(
                system="Answer this sub-question using only the provided context. Be concise.",
                human=f"Context:\n{context}\n\nSub-question: {step}",
            )
            step_answers.append({"step": step, "answer": step_ans})
            running_context += f"\n{step}: {step_ans}"

        # Deduplicate chunks
        seen = set()
        unique_chunks = []
        for c in all_chunks:
            key = c["content"][:80]
            if key not in seen:
                seen.add(key)
                unique_chunks.append(c)

        return {
            "query": query,
            "steps": step_answers,
            "chunks": unique_chunks,
            "running_context": running_context,
            "channel": "vector",
        }
