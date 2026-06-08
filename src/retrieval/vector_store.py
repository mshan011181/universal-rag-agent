import json
import time
from pathlib import Path
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
from langchain_community.document_loaders import TextLoader
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


def _describe_image_bytes(image_bytes: bytes, ext: str = "png", context: str = "") -> str:
    """Send raw image bytes to Groq Vision and return a description.

    Args:
        image_bytes: Raw bytes of the image.
        ext:         Image format extension (png/jpg/gif/webp/bmp).
        context:     Hint (e.g. slide number) added to the prompt.
    Returns:
        Vision model description, or empty string on failure.
    """
    import base64
    try:
        from groq import Groq
    except ImportError:
        return ""

    mime_map = {
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "gif": "image/gif", "webp": "image/webp", "bmp": "image/bmp",
        "tiff": "image/tiff", "emf": "image/png", "wmf": "image/png",
    }
    mime = mime_map.get(ext.lower().lstrip("."), "image/png")
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime};base64,{b64}"

    prompt = (
        f"You are analyzing an image embedded in a PowerPoint slide{' (' + context + ')' if context else ''}.\n"
        "Extract ALL information visible:\n"
        "1. DIAGRAMS/FLOWCHARTS: describe each node, arrow, label, and flow\n"
        "2. CHARTS/GRAPHS: type, axes, values, trends, legend items\n"
        "3. TABLES: reproduce all rows and columns as pipe-separated text\n"
        "4. SCREENSHOTS/UI: describe the interface, visible text, key actions\n"
        "5. ARCHITECTURE DIAGRAMS: components, connections, data flow\n"
        "6. ANY TEXT: transcribe verbatim\n\n"
        "Be thorough — this text will be the only representation of this image in the RAG system."
    )

    try:
        client = Groq()
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            max_tokens=2048,
            messages=[{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt},
            ]}],
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return ""


def _extract_text_from_pptx(path: Path) -> str:
    """Extract text AND embedded images from a PowerPoint file (.pptx).

    For each slide:
      - All text shapes are extracted verbatim.
      - All Picture shapes have their image sent to Groq Vision for
        description, which is appended under '### Embedded Image N'.
    """
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    prs = Presentation(str(path))
    lines = []

    for slide_num, slide in enumerate(prs.slides, start=1):
        lines.append(f"\n--- Slide {slide_num} ---")

        img_count = 0
        for shape in slide.shapes:
            # ── Text ─────────────────────────────────────────────────────
            if hasattr(shape, "text") and shape.text.strip():
                lines.append(shape.text.strip())

            # ── Embedded images (Picture shapes) ─────────────────────────
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                try:
                    img = shape.image
                    ext = img.ext  # e.g. 'png', 'jpeg'
                    img_bytes = img.blob
                    img_count += 1
                    context = f"Slide {slide_num}, Image {img_count}"
                    description = _describe_image_bytes(img_bytes, ext, context)
                    if description:
                        lines.append(f"\n### Embedded Image {img_count} (Slide {slide_num})")
                        lines.append(description)
                except Exception:
                    pass  # skip unreadable images silently

    return "\n".join(lines)


def _extract_text_from_pdf(path: Path) -> str:
    """Extract text AND embedded images from a PDF using pypdf + Groq Vision.

    For each page:
      - Page text is extracted via pypdf.
      - Every image object on the page is sent to Groq Vision for description,
        appended as '### Image N (Page P)'.
    """
    import pypdf

    reader = pypdf.PdfReader(str(path), strict=False)
    lines = []

    for page_num, page in enumerate(reader.pages, start=1):
        lines.append(f"\n--- Page {page_num} ---")

        # ── Text ────────────────────────────────────────────────────────
        page_text = page.extract_text() or ""
        if page_text.strip():
            lines.append(page_text.strip())

        # ── Images ──────────────────────────────────────────────────────
        img_count = 0
        try:
            for img_obj in page.images:
                try:
                    img_bytes = img_obj.data
                    # pypdf gives .name like 'Im0.png'; derive ext from it
                    ext = Path(img_obj.name).suffix.lstrip(".") or "png"
                    img_count += 1
                    context = f"Page {page_num}, Image {img_count}"
                    description = _describe_image_bytes(img_bytes, ext, context)
                    if description:
                        lines.append(f"\n### Image {img_count} (Page {page_num})")
                        lines.append(description)
                except Exception:
                    pass
        except Exception:
            pass  # some PDFs have no extractable image objects

    return "\n".join(lines)


def _extract_text_from_docx(path: Path) -> str:
    """Extract text AND embedded images from a DOCX via python-docx + Groq Vision.

    - Paragraph text extracted in document order.
    - Inline images (via document part relationships) sent to Groq Vision,
      appended as '### Embedded Image N'.
    """
    import docx

    doc = docx.Document(str(path))
    lines = []

    # ── Text ────────────────────────────────────────────────────────────
    for para in doc.paragraphs:
        if para.text.strip():
            lines.append(para.text.strip())

    # Also extract text from tables
    for table in doc.tables:
        for row in table.rows:
            row_text = "\t".join(cell.text.strip() for cell in row.cells)
            if row_text.strip():
                lines.append(row_text)

    # ── Images ──────────────────────────────────────────────────────────
    # DOCX stores images as related parts; iterate all image relationships
    img_count = 0
    IMAGE_CONTENT_TYPES = {
        "image/png", "image/jpeg", "image/gif",
        "image/webp", "image/bmp", "image/tiff",
    }
    try:
        for rel in doc.part.rels.values():
            try:
                ct = rel.target_part.content_type
                if ct not in IMAGE_CONTENT_TYPES:
                    continue
                img_bytes = rel.target_part.blob
                ext = ct.split("/")[-1]  # e.g. 'png', 'jpeg'
                img_count += 1
                context = f"Image {img_count}"
                description = _describe_image_bytes(img_bytes, ext, context)
                if description:
                    lines.append(f"\n### Embedded Image {img_count}")
                    lines.append(description)
            except Exception:
                pass
    except Exception:
        pass

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


def ingest_file(file_path: str, namespace: str = "default", source_name: str | None = None) -> int:
    """Ingest a document file into Pinecone.

    Args:
        file_path:   Path to the saved (possibly hashed) file on disk.
        namespace:   Pinecone namespace (org_id).
        source_name: Human-readable original filename to store as metadata
                     source.  Defaults to path.name if not supplied.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    raw_text: str | None = None  # set when we produce text directly

    if suffix == ".pdf":
        raw_text = _extract_text_from_pdf(path)
    elif suffix in (".txt", ".md", ".csv"):
        loader = TextLoader(str(path), encoding="utf-8")
    elif suffix in (".docx", ".doc"):
        raw_text = _extract_text_from_docx(path)
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

    # Resolve the display source name — prefer caller-supplied original filename
    display_source = source_name or path.name
    # Use a stable vector ID prefix from the display name (not the hashed disk name)
    id_prefix = Path(display_source).stem

    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

    if raw_text is not None:
        # Text-based path — split the raw string directly
        text_chunks = splitter.split_text(raw_text)
        if not text_chunks:
            return 0
        embeddings = _embed(text_chunks)
        vectors = [
            {
                "id": f"{id_prefix}_{i}",
                "values": emb,
                "metadata": {
                    "content": chunk,
                    "source": display_source,
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
            "id": f"{id_prefix}_{i}",
            "values": emb,
            "metadata": {
                "content": chunk.page_content,
                "source": display_source,
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


def retrieve(query: str, k: int = TOP_K, namespace: str = "default",
             min_score: float = 0.35) -> list[dict]:
    """Retrieve top-k chunks by semantic similarity.

    Args:
        min_score: Cosine similarity floor. Chunks below this score are
                   discarded before returning — prevents loosely-related
                   documents from contaminating the context.
    """
    emb = _embed([query])[0]
    results = _get_index().query(vector=emb, top_k=k, namespace=namespace, include_metadata=True)
    chunks = []
    for match in results.get("matches", []):
        score = round(match.get("score", 0.0), 4)
        if score < min_score:
            continue
        meta = dict(match.get("metadata", {}))
        content = meta.pop("content", "")
        chunks.append({"content": content, "metadata": meta, "score": score})
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
