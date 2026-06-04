import time
from pathlib import Path
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from src.config import (
    EMBEDDING_MODEL, EMBEDDING_DIM, CHUNK_SIZE, CHUNK_OVERLAP, TOP_K,
    PINECONE_API_KEY, PINECONE_INDEX_NAME,
)

_PINECONE_CLOUD = "aws"
_PINECONE_REGION = "us-east-1"

_pc: Pinecone | None = None
_index = None
_embedder: SentenceTransformer | None = None


def _get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBEDDING_MODEL)
    return _embedder


def _ensure_index(pc: Pinecone) -> None:
    existing = [idx.name for idx in pc.list_indexes()]
    if PINECONE_INDEX_NAME in existing:
        return
    pc.create_index(
        name=PINECONE_INDEX_NAME,
        dimension=EMBEDDING_DIM,
        metric="cosine",
        spec=ServerlessSpec(cloud=_PINECONE_CLOUD, region=_PINECONE_REGION),
    )
    for _ in range(60):
        if pc.describe_index(PINECONE_INDEX_NAME).status.get("ready", False):
            return
        time.sleep(2)


def _get_index():
    global _pc, _index
    if _index is None:
        _pc = Pinecone(api_key=PINECONE_API_KEY)
        _ensure_index(_pc)
        _index = _pc.Index(PINECONE_INDEX_NAME)
    return _index


def _embed(texts: list[str]) -> list[list[float]]:
    return _get_embedder().encode(texts, show_progress_bar=False).tolist()


def ingest_file(file_path: str, namespace: str = "default") -> int:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        loader = PyPDFLoader(str(path))
    elif suffix == ".txt":
        loader = TextLoader(str(path), encoding="utf-8")
    elif suffix in [".docx", ".doc"]:
        loader = Docx2txtLoader(str(path))
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = splitter.split_documents(docs)

    if not chunks:
        return 0

    texts = [c.page_content for c in chunks]
    embeddings = _embed(texts)
    vectors = [
        {
            "id": f"{path.stem}_{i}",
            "values": emb,
            "metadata": {
                "content": chunk.page_content,
                "source": path.name,
                "chunk_idx": i,
                "page": chunk.metadata.get("page", 0),
            },
        }
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]
    _get_index().upsert(vectors=vectors, namespace=namespace)
    return len(vectors)


def ingest_text(text: str, source: str = "manual", namespace: str = "default") -> int:
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = splitter.split_text(text)
    if not chunks:
        return 0
    embeddings = _embed(chunks)
    vectors = [
        {
            "id": f"{source}_{i}",
            "values": emb,
            "metadata": {"content": chunk, "source": source, "chunk_idx": i},
        }
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]
    _get_index().upsert(vectors=vectors, namespace=namespace)
    return len(vectors)


def retrieve(query: str, k: int = TOP_K, namespace: str = "default") -> list[dict]:
    emb = _embed([query])[0]
    results = _get_index().query(vector=emb, top_k=k, namespace=namespace, include_metadata=True)
    chunks = []
    for match in results.get("matches", []):
        meta = dict(match.get("metadata", {}))
        content = meta.pop("content", "")
        chunks.append({"content": content, "metadata": meta, "score": round(match.get("score", 0.0), 4)})
    return chunks


def collection_count(namespace: str = "default") -> int:
    try:
        stats = _get_index().describe_index_stats()
        ns = stats.get("namespaces", {}).get(namespace, {})
        return ns.get("vector_count", 0)
    except Exception:
        return 0


def list_sources(namespace: str = "default") -> list[str]:
    # Pinecone does not support full metadata enumeration without a fetch;
    # returning the active namespace as a proxy for source listing.
    try:
        stats = _get_index().describe_index_stats()
        return sorted(stats.get("namespaces", {}).keys())
    except Exception:
        return []
