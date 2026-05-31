from src.config import TAVILY_API_KEY


def web_search(query: str, max_results: int = 3) -> list[dict]:
    if not TAVILY_API_KEY:
        return []
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=TAVILY_API_KEY)
        response = client.search(query=query, max_results=max_results)
        chunks = []
        for r in response.get("results", []):
            chunks.append({
                "content": r.get("content", ""),
                "metadata": {"source": r.get("url", "web"), "title": r.get("title", "")},
                "score": r.get("score", 0.5),
            })
        return chunks
    except Exception:
        return []
