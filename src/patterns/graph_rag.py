import json
import networkx as nx
from src.patterns.base import BasePattern
from src.config import DATA_DIR
import pickle
from pathlib import Path

GRAPH_PATH = DATA_DIR / "knowledge_graph.pkl"


def load_graph() -> nx.Graph:
    if GRAPH_PATH.exists():
        with open(GRAPH_PATH, "rb") as f:
            return pickle.load(f)
    return nx.Graph()


def save_graph(G: nx.Graph):
    with open(GRAPH_PATH, "wb") as f:
        pickle.dump(G, f)


class GraphRAG(BasePattern):
    name = "graph_rag"

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        # Vector retrieval as base
        chunks = self._retrieve(query)

        # Extract entities from query
        raw = self._llm_call(
            system='Extract key named entities from this query. Return as JSON array of strings: ["entity1", "entity2"]',
            human=f"Query: {query}",
            temperature=0.0,
        )
        try:
            start = raw.find("["); end = raw.rfind("]") + 1
            entities = json.loads(raw[start:end])
        except Exception:
            entities = []

        G = load_graph()
        graph_context = []

        for entity in entities[:5]:
            # Find nodes matching entity (case-insensitive)
            matches = [n for n in G.nodes if entity.lower() in str(n).lower()]
            for match in matches[:3]:
                neighbors = list(G.neighbors(match))[:5]
                for neighbor in neighbors:
                    edge_data = G.get_edge_data(match, neighbor, {})
                    rel = edge_data.get("relation", "related_to")
                    graph_context.append(f"{match} --[{rel}]--> {neighbor}")

        if graph_context:
            graph_chunk = {
                "content": "Knowledge Graph Context:\n" + "\n".join(graph_context),
                "metadata": {"source": "knowledge_graph"},
                "score": 0.9,
            }
            chunks = [graph_chunk] + chunks

        return {"query": query, "chunks": chunks, "entities": entities, "channel": "mixed"}
