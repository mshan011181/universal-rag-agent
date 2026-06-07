from concurrent.futures import ThreadPoolExecutor, as_completed
from src.patterns.base import BasePattern
from src.generation.llm import get_llm, safe_invoke
from langchain_core.messages import SystemMessage, HumanMessage


class SpeculativeRAG(BasePattern):
    name = "speculative_rag"

    def run(self, query: str, analysis: dict, chunks: list[dict] = None, **kwargs) -> dict:
        if chunks is None:
            chunks = self._retrieve(query, k=10, namespace=analysis.get('namespace', 'default'))

        # Split chunks into subsets for parallel drafting
        n = max(1, len(chunks) // 2)
        subsets = [chunks[:n], chunks[n:]] if len(chunks) > 1 else [chunks]

        def draft(subset):
            ctx = "\n\n".join([c["content"] for c in subset])
            llm = get_llm(temperature=0.2)
            return safe_invoke(llm, [
                SystemMessage(content="Draft a concise answer using only the context provided."),
                HumanMessage(content=f"Context:\n{ctx}\n\nQuestion: {query}")
            ])

        drafts = []
        with ThreadPoolExecutor(max_workers=2) as ex:
            futures = {ex.submit(draft, s): i for i, s in enumerate(subsets)}
            for f in as_completed(futures):
                try:
                    drafts.append(f.result())
                except Exception:
                    pass

        if not drafts:
            return {"query": query, "chunks": chunks, "channel": "vector"}

        drafts_text = "\n\n---\n\n".join([f"Draft {i+1}:\n{d}" for i, d in enumerate(drafts)])
        best = self._llm_call(
            system="You are a judge. Read the draft answers below and either select the best one or synthesize them into a superior answer. Output only the final answer.",
            human=f"Question: {query}\n\n{drafts_text}",
            temperature=0.0,
        )

        return {"query": query, "chunks": chunks, "answer": best, "channel": "vector"}
