import chromadb
from chromadb.utils import embedding_functions
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from src.config import CHROMA_PATH, EMBEDDING_MODEL, CHUNK_SIZE, CHUNK_OVERLAP, TOP_K
from pathlib import Path

_client = None
_collection = None
_ef = None


def _get_ef():
    global _ef
    if _ef is None:
        _ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL)
    return _ef


def get_collection(name: str = "universal_rag"):
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        _collection = _client.get_or_create_collection(name=name, embedding_function=_get_ef())
    return _collection


def ingest_file(file_path: str) -> int:
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

    col = get_collection()
    ids, texts, metas = [], [], []
    for i, chunk in enumerate(chunks):
        chunk_id = f"{path.stem}_{i}"
        ids.append(chunk_id)
        texts.append(chunk.page_content)
        metas.append({"source": path.name, "chunk_idx": i, "page": chunk.metadata.get("page", 0)})

    if ids:
        col.upsert(ids=ids, documents=texts, metadatas=metas)

    return len(ids)


def ingest_text(text: str, source: str = "manual") -> int:
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = splitter.split_text(text)
    col = get_collection()
    ids = [f"{source}_{i}" for i in range(len(chunks))]
    metas = [{"source": source, "chunk_idx": i} for i in range(len(chunks))]
    if ids:
        col.upsert(ids=ids, documents=chunks, metadatas=metas)
    return len(ids)


def retrieve(query: str, k: int = TOP_K) -> list[dict]:
    col = get_collection()
    results = col.query(query_texts=[query], n_results=min(k, col.count() or 1))
    chunks = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]
    for doc, meta, dist in zip(docs, metas, dists):
        score = max(0.0, 1.0 - dist)
        chunks.append({"content": doc, "metadata": meta, "score": round(score, 4)})
    return chunks


def collection_count() -> int:
    try:
        return get_collection().count()
    except Exception:
        return 0


def list_sources() -> list[str]:
    try:
        col = get_collection()
        results = col.get(include=["metadatas"])
        sources = list({m.get("source", "unknown") for m in results.get("metadatas", [])})
        return sorted(sources)
    except Exception:
        return []
