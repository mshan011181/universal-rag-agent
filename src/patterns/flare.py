from src.patterns.base import BasePattern


class FLARE(BasePattern):
    name = "flare"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        # Initial retrieval
        initial_chunks = self._retrieve(query)
        context = "\n\n".join([c["content"] for c in initial_chunks])

        # Generate partial answer and detect confidence gaps
        partial = self._llm_call(
            system=(
                "Begin answering the query using the provided context. "
                "If at any point you are uncertain or lack information, "
                "output [RETRIEVE: <what you need>] to signal a retrieval need. "
                "Then continue."
            ),
            human=f"Context:\n{context}\n\nQuery: {query}",
        )

        all_chunks = list(initial_chunks)

        # Process retrieval signals
        if "[RETRIEVE:" in partial:
            import re
            signals = re.findall(r'\[RETRIEVE:\s*(.+?)\]', partial)
            for signal in signals[:3]:
                extra_chunks = self._retrieve(signal.strip())
                all_chunks.extend(extra_chunks)

            # Final generation with enriched context
            full_context = "\n\n".join([c["content"] for c in all_chunks])
            final_answer = self._llm_call(
                system="Generate a complete, well-grounded answer using all provided context. Do not use prior knowledge.",
                human=f"Context:\n{full_context}\n\nQuery: {query}",
            )
        else:
            final_answer = partial

        # Deduplicate
        seen = set()
        unique_chunks = []
        for c in all_chunks:
            key = c["content"][:80]
            if key not in seen:
                seen.add(key)
                unique_chunks.append(c)

        return {"query": query, "chunks": unique_chunks, "answer": final_answer, "channel": "vector"}
