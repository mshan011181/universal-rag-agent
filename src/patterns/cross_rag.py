"""
CrossRag — Source-Aware Cross-Document Retrieval + Dual-Source Synthesis

For queries that require synthesizing across 2+ documents:
  1. Detect cross-doc intent from keywords or explicit filenames
  2. Retrieve chunks from each document via retrieve_by_source (bypasses TOP_K limit)
  3. Cross-rerank: ensure both sources are represented
  4. Tag state with cross_sources so pattern_router uses synthesize_cross()

Applies to PDFs, DOCX, PPTX, TXT, Weblinks — NOT Excel/CSV (those → BIRag).
Falls back silently (returns {}) if fewer than 2 distinct sources found.
"""

import re
from .base import BasePattern
from src.retrieval.vector_store import retrieve_by_source
from src.retrieval.reranker import rerank
from src.memory.sqlite_store import get_recent_docs


# ── Cross-doc keyword detection ───────────────────────────────────────────────
_CROSS_KEYWORDS = [
    "both documents", "both files", "both reports", "both pdfs",
    "both papers", "two documents", "two files", "two reports",
    "compare", "comparison", "contrast", "versus", " vs ", " vs.",
    "difference between", "differences between",
    "similarity between", "similarities between",
    "across both", "from both", "in both",
    "which document", "which file", "which report",
    "synthesize", "synthesis", "combine", "together",
    "conflict", "contradict", "agree", "disagree",
    "doc1", "doc2", "file1", "file2", "document 1", "document 2",
]

# Matches document filenames in the query
_FILE_RE = re.compile(
    r'\b([\w\-.()\s]+\.(pdf|docx?|pptx?|txt|md|csv|weblink))\b',
    re.IGNORECASE,
)

# Spreadsheet extensions — handled by BIRag, not CrossRag
_SPREADSHEET_EXTS = {".xlsx", ".xls", ".csv"}


class CrossRag(BasePattern):
    name = "cross_rag"

    # ── Public interface ──────────────────────────────────────────────────────

    def run(self, query: str, analysis: dict, chunks=None, **kwargs) -> dict:
        if not self._is_cross_query(query):
            return {}

        namespace = analysis.get("namespace", "default")
        user_id = analysis.get("user_id", "")

        # 1. Try to extract explicit filenames from query
        mentioned = self._extract_filenames(query)

        # 2. If < 2 specific files mentioned, fall back to recently ingested docs
        if len(mentioned) < 2 and user_id:
            recent = get_recent_docs(user_id, n=2)
            for r in recent:
                name = r["source_name"]
                if name not in mentioned:
                    mentioned.append(name)

        if len(mentioned) < 2:
            # Can't do cross-synthesis without 2 sources
            return {}

        # 3. Retrieve from each source (up to top 2 sources)
        all_chunks: list[dict] = []
        found_sources: list[str] = []

        for source_name in mentioned[:2]:
            source_chunks = retrieve_by_source(source_name, namespace=namespace, k=20)
            if source_chunks:
                all_chunks.extend(source_chunks)
                found_sources.append(source_name)

        if len(found_sources) < 2:
            # Only 1 source found in index — fall through to normal RAG
            return {}

        # 4. Cross-rerank: ensure both sources are represented in final set
        reranked = rerank(query, all_chunks, top_n=20)
        balanced = self._balance_sources(reranked, found_sources, per_source=5, total=10)

        if not balanced:
            return {}

        return {
            "chunks": balanced,
            "channel": "cross_document",
            "cross_sources": found_sources,   # picked up by pattern_router
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _is_cross_query(query: str) -> bool:
        q = query.lower()
        return any(kw in q for kw in _CROSS_KEYWORDS)

    @staticmethod
    def _extract_filenames(query: str) -> list[str]:
        """Extract document filenames from the query string."""
        names = []
        for m in _FILE_RE.finditer(query):
            name = m.group(1).strip()
            ext = "." + m.group(2).lower()
            if ext not in _SPREADSHEET_EXTS and name not in names:
                names.append(name)
        return names

    @staticmethod
    def _balance_sources(
        reranked: list[dict],
        sources: list[str],
        per_source: int,
        total: int,
    ) -> list[dict]:
        """Pick up to per_source chunks per source, total capped at total.

        Ensures both documents are represented even if one scores much higher.
        """
        counts: dict[str, int] = {s: 0 for s in sources}
        result: list[dict] = []

        for chunk in reranked:
            src = chunk["metadata"].get("source", "")
            # Match source name to one of our target sources
            matched = next(
                (s for s in sources if s in src or src in s),
                None,
            )
            if matched and counts[matched] < per_source:
                result.append(chunk)
                counts[matched] += 1
            if len(result) >= total:
                break

        # If one source is completely absent (e.g. source name mismatch),
        # still return what we have — better than nothing
        return result
