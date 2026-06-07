import json
import time
from pathlib import Path
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
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


def _extract_text_from_pptx(path: Path) -> str:
    """Extract all text from a PowerPoint file (.pptx)."""
    from pptx import Presentation
    prs = Presentation(str(path))
    lines = []
    for slide_num, slide in enumerate(prs.slides, start=1):
        lines.append(f"\n--- Slide {slide_num} ---")
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                lines.append(shape.text.strip())
    return "\n".join(lines)


def _extract_text_from_xls(path: Path) -> str:
    """Extract all text from a legacy Excel file (.xls)."""
    import xlrd
    wb = xlrd.open_workbook(str(path))
    lines = []
    for sheet in wb.sheets():
        lines.append(f"\n--- Sheet: {sheet.name} ---")
        for row_idx in range(sheet.nrows):
            row = [str(sheet.cell_value(row_idx, col)) for col in range(sheet.ncols)]
            lines.append("\t".join(row))
    return "\n".join(lines)


def _extract_text_from_xlsx(path: Path) -> str:
    """Extract all text from a modern Excel file (.xlsx)."""
    import openpyxl
    wb = openpyxl.load_workbook(str(path), data_only=True)
    lines = []
    for sheet in wb.worksheets:
        lines.append(f"\n--- Sheet: {sheet.title} ---")
        for row in sheet.iter_rows(values_only=True):
            row_str = "\t".join(str(cell) if cell is not None else "" for cell in row)
            if row_str.strip():
                lines.append(row_str)
    return "\n".join(lines)


def _extract_text_from_json(path: Path) -> str:
    """Convert JSON / GeoJSON to indented text for chunking."""
    with open(str(path), "r", encoding="utf-8") as f:
        data = json.load(f)
    return json.dumps(data, indent=2, ensure_ascii=False)


def ingest_file(file_path: str, namespace: str = "default") -> int:
    path = Path(file_path)
    suffix = path.suffix.lower()

    raw_text: str | None = None  # set when we produce text directly

    if suffix == ".pdf":
        loader = PyPDFLoader(str(path))
    elif suffix in (".txt", ".md", ".csv"):
        loader = TextLoader(str(path), encoding="utf-8")
    elif suffix in (".docx", ".doc"):
        loader = Docx2txtLoader(str(path))
    elif suffix in (".pptx", ".ppt"):
        raw_text = _extract_text_from_pptx(path)
    elif suffix == ".xls":
        raw_text = _extract_text_from_xls(path)
    elif suffix in (".xlsx", ".xlsm"):
        raw_text = _extract_text_from_xlsx(path)
    elif suffix in (".json", ".geojson", ".gjson"):
        raw_text = _extract_text_from_json(path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

    if raw_text is not None:
        # Text-based path — split the raw string directly
        text_chunks = splitter.split_text(raw_text)
        if not text_chunks:
            return 0
        embeddings = _embed(text_chunks)
        vectors = [
            {
                "id": f"{path.stem}_{i}",
                "values": emb,
                "metadata": {
                    "content": chunk,
                    "source": path.name,
                    "chunk_idx": i,
                },
            }
            for i, (chunk, emb) in enumerate(zip(text_chunks, embeddings))
        ]
        _get_index().upsert(vectors=vectors, namespace=namespace)
        return len(vectors)

    # LangChain Document path (PDF / TXT / DOCX)
    docs = loader.load()
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


def retrieve_by_source(filename: str, namespace: str = "default", k: int = 20) -> list[dict]:
    """Fetch all chunks whose source metadata contains the given filename.

    Images are stored as  image:<filename>
    Videos are stored as  video:<filename>
    Audio  is stored as   audio:<filename>
    Raw files are stored as <filename>
    We try all variants so filename-based queries always hit.
    """
    # Build candidate source values
    base = filename.strip()
    candidates = [
        base,
        f"image:{base}",
        f"video:{base}",
        f"audio:{base}",
    ]
    try:
        # Use a dummy zero-vector; filter does the real work
        dim = _get_embedder().get_sentence_embedding_dimension()
        zero_vec = [0.0] * dim
        results = _get_index().query(
            vector=zero_vec,
            top_k=k,
            namespace=namespace,
            include_metadata=True,
            filter={"source": {"$in": candidates}},
        )
        chunks = []
        for match in results.get("matches", []):
            meta = dict(match.get("metadata", {}))
            content = meta.pop("content", "")
            if content:
                chunks.append({
                    "content": content,
                    "metadata": meta,
                    "score": round(match.get("score", 0.9), 4),
                })
        return chunks
    except Exception:
        return []


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
