import json
import re as _re
import time
from pathlib import Path


def _clean_text(text: str) -> str:
    """Normalise raw extracted text before chunking.

    Removes:
    - HTML / XML tags
    - Null bytes and non-printable control characters (except newlines/tabs)
    - Repeated whitespace / blank lines (3+ → 2)
    - Common boilerplate footers (cookie banners, print headers, etc.)
    """
    # HTML tags
    text = _re.sub(r'<[^>]+>', ' ', text)
    # Null bytes and control chars (keep \n \t)
    text = _re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    # Unicode replacement characters
    text = text.replace('�', '')
    # Collapse 3+ consecutive blank lines → 2
    text = _re.sub(r'\n{3,}', '\n\n', text)
    # Collapse sequences of spaces/tabs → single space (within lines)
    text = _re.sub(r'[ \t]{2,}', ' ', text)
    # Strip common boilerplate phrases (case-insensitive)
    _BOILERPLATE = [
        r'cookie policy.*?(?=\n|$)',
        r'privacy policy.*?(?=\n|$)',
        r'terms of (use|service).*?(?=\n|$)',
        r'all rights reserved.*?(?=\n|$)',
        r'subscribe to our newsletter.*?(?=\n|$)',
        r'javascript must be enabled.*?(?=\n|$)',
    ]
    for pat in _BOILERPLATE:
        text = _re.sub(pat, '', text, flags=_re.IGNORECASE)
    return text.strip()


def _rows_to_text(rows: list[list[str]]) -> list[str]:
    """Convert a 2-D table (list of rows, each a list of cell strings) to
    header-enriched text lines so column labels stay with their values.

    Example — given:
        [["Competition","Test","ODI","FC"], ["Batting average","53.78","44.83","57.84"]]
    Returns:
        ["Competition | Test | ODI | FC",
         "Batting average: Test=53.78 | ODI=44.83 | FC=57.84"]
    """
    if not rows:
        return []
    result = []
    headers: list[str] = []
    for row in rows:
        cells = [str(c).strip() for c in row]
        if not any(cells):
            continue
        # Detect header row: all cells non-empty and first data row not yet set
        if not headers:
            headers = cells
            result.append(" | ".join(cells))
        elif headers and len(cells) == len(headers) and len(headers) > 1:
            row_label = cells[0]
            enriched = [f"{headers[i]}={cells[i]}" for i in range(1, len(cells)) if cells[i]]
            # Emit plain pipe (legacy) AND enriched (header-labelled) so both
            # raw-value and column-label queries hit the same data.
            result.append(" | ".join(cells))
            result.append(f"{row_label}: {' | '.join(enriched)}" if enriched else " | ".join(cells))
        else:
            result.append(" | ".join(cells))
    return result
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from src.config import (
    EMBEDDING_MODEL, EMBEDDING_DIM, CHUNK_SIZE, CHUNK_OVERLAP, CHUNK_SIZES, TOP_K,
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

    loc = f" ({context})" if context else ""
    prompt = (
        f"You are analyzing an embedded image from a document{loc}.\n"
        "Extract ALL information visible:\n"
        "1. DIAGRAMS/FLOWCHARTS: describe each node, arrow, label, and flow\n"
        "2. CHARTS/GRAPHS: type, axes, all data values, trends, legend items\n"
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
    """Extract text, tables, images, and charts from a PowerPoint file (.pptx).

    For each slide:
      - Text shapes → verbatim text
      - TABLE shapes → pipe-separated rows
      - PICTURE shapes → Groq Vision description
      - CHART shapes → chart title + series data as text; chart image via Vision if available
      - GROUP shapes → recursed to find nested pictures
    """
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    prs = Presentation(str(path))
    lines = []
    img_counter = [0]  # mutable counter shared across helper

    def _process_picture(shape, slide_num: int):
        try:
            img = shape.image
            img_bytes = img.blob
            img_counter[0] += 1
            context = f"Slide {slide_num}, Image {img_counter[0]}"
            desc = _describe_image_bytes(img_bytes, img.ext, context)
            if desc:
                lines.append(f"\n### Embedded Image {img_counter[0]} (Slide {slide_num})")
                lines.append(desc)
        except Exception:
            pass

    def _process_shape(shape, slide_num: int):
        # Text
        if hasattr(shape, "text") and shape.text.strip():
            lines.append(shape.text.strip())

        stype = shape.shape_type

        # Table
        if stype == MSO_SHAPE_TYPE.TABLE:
            try:
                raw_rows = [[cell.text.strip() for cell in row.cells] for row in shape.table.rows]
                lines.extend(_rows_to_text(raw_rows))
            except Exception:
                pass

        # Picture
        elif stype == MSO_SHAPE_TYPE.PICTURE:
            _process_picture(shape, slide_num)

        # Chart — extract title + series labels/values as structured text
        elif stype == MSO_SHAPE_TYPE.CHART:
            try:
                chart = shape.chart
                chart_title = ""
                try:
                    chart_title = chart.chart_title.text_frame.text.strip()
                except Exception:
                    pass
                lines.append(f"\n### Chart{': ' + chart_title if chart_title else ''} (Slide {slide_num})")
                for series in chart.series:
                    try:
                        s_name = series.name or "Series"
                        values = [str(v) for v in (series.values or [])]
                        lines.append(f"{s_name}: {', '.join(values)}")
                    except Exception:
                        pass
            except Exception:
                pass

        # Group — recurse into child shapes to find nested pictures/charts
        elif stype == MSO_SHAPE_TYPE.GROUP:
            try:
                for child in shape.shapes:
                    _process_shape(child, slide_num)
            except Exception:
                pass

    for slide_num, slide in enumerate(prs.slides, start=1):
        lines.append(f"\n--- Slide {slide_num} ---")
        for shape in slide.shapes:
            _process_shape(shape, slide_num)

    return "\n".join(lines)


def _extract_text_from_pdf(path: Path) -> str:
    """Extract text, tables, and embedded images from a PDF.

    Uses pdfplumber for table-aware text extraction (preserves row/column
    structure as pipe-separated lines), then falls back to pypdf for images.

    For each page:
      - Tables detected by pdfplumber → pipe-separated rows.
      - Non-table text extracted verbatim.
      - Images sent to Groq Vision for description.
    """
    import pypdf
    import pdfplumber

    lines = []

    with pdfplumber.open(str(path)) as pdf:
        for page_num, plumb_page in enumerate(pdf.pages, start=1):
            lines.append(f"\n--- Page {page_num} ---")

            # ── Tables (pdfplumber detects row/col boundaries) ───────────
            tables = plumb_page.extract_tables() or []
            table_bboxes = [t.bbox for t in plumb_page.find_tables()]
            for table in tables:
                raw_rows = [
                    [str(cell).strip() if cell is not None else "" for cell in row]
                    for row in table
                ]
                lines.extend(_rows_to_text(raw_rows))

            # ── Plain text (excluding table regions) ─────────────────────
            if table_bboxes:
                # Crop away table bounding boxes so we don't double-extract
                crop = plumb_page
                for bbox in table_bboxes:
                    try:
                        crop = crop.filter(lambda obj, bb=bbox: not (
                            bb[0] <= obj.get("x0", 0) <= bb[2] and
                            bb[1] <= obj.get("top", 0) <= bb[3]
                        ))
                    except Exception:
                        pass
                page_text = crop.extract_text() or ""
            else:
                page_text = plumb_page.extract_text() or ""

            if page_text.strip():
                lines.append(page_text.strip())

    # ── Images via pypdf ─────────────────────────────────────────────────
    try:
        reader = pypdf.PdfReader(str(path), strict=False)
        for page_num, page in enumerate(reader.pages, start=1):
            img_count = 0
            try:
                for img_obj in page.images:
                    try:
                        img_bytes = img_obj.data
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
                pass
    except Exception:
        pass

    return "\n".join(lines)


def _extract_text_from_docx(path: Path) -> str:
    """Extract text AND embedded images from a DOCX via python-docx + Groq Vision.

    - Paragraph text extracted in document order.
    - Tables extracted as pipe-separated rows to preserve column context.
    - Inline images sent to Groq Vision.
    """
    import docx

    doc = docx.Document(str(path))
    lines = []

    # ── Text (paragraphs and tables interleaved in document order) ───────
    for para in doc.paragraphs:
        if para.text.strip():
            lines.append(para.text.strip())

    # Tables → header-enriched rows (label stays with column values)
    for table in doc.tables:
        raw_rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        lines.extend(_rows_to_text(raw_rows))

    # ── Images ──────────────────────────────────────────────────────────
    # Collect image parts from ALL document parts: main body, headers,
    # footers, footnotes, endnotes, and any other related parts.
    img_count = 0
    IMAGE_CONTENT_TYPES = {
        "image/png", "image/jpeg", "image/gif",
        "image/webp", "image/bmp", "image/tiff",
    }
    seen_blobs: set[int] = set()   # avoid duplicating the same image blob

    def _extract_images_from_part(part):
        nonlocal img_count
        try:
            for rel in part.rels.values():
                try:
                    target = rel.target_part
                    ct = target.content_type
                    if ct not in IMAGE_CONTENT_TYPES:
                        continue
                    blob = target.blob
                    blob_id = hash(blob)
                    if blob_id in seen_blobs:
                        continue
                    seen_blobs.add(blob_id)
                    ext = ct.split("/")[-1]
                    img_count += 1
                    context = f"Image {img_count}"
                    desc = _describe_image_bytes(blob, ext, context)
                    if desc:
                        lines.append(f"\n### Embedded Image {img_count}")
                        lines.append(desc)
                except Exception:
                    pass
        except Exception:
            pass

    # Main document body
    _extract_images_from_part(doc.part)
    # Headers and footers
    for section in doc.sections:
        for hf_part in [section.header.part, section.footer.part,
                         section.even_page_header.part, section.even_page_footer.part,
                         section.first_page_header.part, section.first_page_footer.part]:
            try:
                _extract_images_from_part(hf_part)
            except Exception:
                pass

    return "\n".join(lines)


def _extract_text_from_xls(path: Path) -> str:
    """Extract all text from a legacy Excel file (.xls) as header-enriched rows."""
    import xlrd
    wb = xlrd.open_workbook(str(path))
    lines = []
    for sheet in wb.sheets():
        lines.append(f"\n--- Sheet: {sheet.name} ---")
        raw_rows = [
            [str(sheet.cell_value(row_idx, col)) for col in range(sheet.ncols)]
            for row_idx in range(sheet.nrows)
        ]
        lines.extend(_rows_to_text(raw_rows))
    return "\n".join(lines)


def _extract_text_from_xlsx(path: Path) -> str:
    """Extract text (header-enriched rows) and embedded images from a modern Excel file (.xlsx)."""
    import openpyxl
    wb = openpyxl.load_workbook(str(path), data_only=True)
    lines = []
    img_count = 0
    for sheet in wb.worksheets:
        lines.append(f"\n--- Sheet: {sheet.title} ---")

        # ── Cell data ───────────────────────────────────────────────────
        raw_rows = [
            [str(cell) if cell is not None else "" for cell in row]
            for row in sheet.iter_rows(values_only=True)
        ]
        lines.extend(_rows_to_text(raw_rows))

        # ── Embedded images (charts, logos, diagrams) ────────────────────
        for img_obj in getattr(sheet, "_images", []):
            try:
                img_data = img_obj._data()   # raw bytes
                img_count += 1
                # Derive extension from the image object's format attribute
                fmt = getattr(img_obj, "format", None) or "png"
                context = f"Sheet '{sheet.title}', Image {img_count}"
                desc = _describe_image_bytes(img_data, fmt, context)
                if desc:
                    lines.append(f"\n### Embedded Image {img_count} (Sheet: {sheet.title})")
                    lines.append(desc)
            except Exception:
                pass

    return "\n".join(lines)


def _extract_text_from_json(path: Path) -> str:
    """Convert JSON / GeoJSON to indented text for chunking."""
    with open(str(path), "r", encoding="utf-8") as f:
        data = json.load(f)
    return json.dumps(data, indent=2, ensure_ascii=False)


def _delete_source_vectors(id_prefix: str, namespace: str) -> int:
    """Delete all Pinecone vectors whose ID starts with id_prefix.

    Called before every ingest so re-uploading a file never leaves stale
    chunks behind (e.g. when chunk count changes between uploads).
    Returns the number of vectors deleted.
    """
    try:
        index = _get_index()
        ids_to_delete: list[str] = []
        for page in index.list(prefix=id_prefix, namespace=namespace):
            ids_to_delete.extend(item.id for item in page)
        if ids_to_delete:
            index.delete(ids=ids_to_delete, namespace=namespace)
        return len(ids_to_delete)
    except Exception:
        return 0  # non-fatal — upsert will still overwrite matching IDs


def delete_by_source(source_name: str, namespace: str = "default") -> int:
    """Delete all Pinecone vectors for a given source across all prefix variants.

    Covers plain filenames, image:/video:/audio:/weblink: prefixes and
    URL-derived IDs so a single call cleans up any ingest type.
    Returns total vectors deleted.
    """
    base = source_name.strip()
    prefixes = [
        base,
        f"image:{base}",
        f"video:{base}",
        f"audio:{base}",
        f"weblink:{base}",
    ]
    total = 0
    for prefix in prefixes:
        total += _delete_source_vectors(prefix, namespace)
    return total


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
    doc_type = "narrative"       # default — overridden per file type below

    if suffix == ".pdf":
        raw_text = _extract_text_from_pdf(path)
    elif suffix in (".txt", ".md"):
        loader = TextLoader(str(path), encoding="utf-8")
    elif suffix == ".csv":
        loader = TextLoader(str(path), encoding="utf-8")
        doc_type = "tabular"
    elif suffix in (".docx", ".doc"):
        raw_text = _extract_text_from_docx(path)
    elif suffix in (".pptx", ".ppt"):
        raw_text = _extract_text_from_pptx(path)
    elif suffix == ".xls":
        raw_text = _extract_text_from_xls(path)
        doc_type = "tabular"
    elif suffix in (".xlsx", ".xlsm"):
        raw_text = _extract_text_from_xlsx(path)
        doc_type = "tabular"
    elif suffix in (".json", ".geojson", ".gjson"):
        raw_text = _extract_text_from_json(path)
        doc_type = "code"
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    # Resolve the display source name — prefer caller-supplied original filename
    display_source = source_name or path.name
    # Use a stable vector ID prefix from the display name (not the hashed disk name)
    id_prefix = Path(display_source).stem

    # Delete any existing vectors for this source before upserting new ones.
    # This prevents stale chunks accumulating when a file is re-uploaded with
    # a different chunk count (e.g. file updated, or chunk size changed).
    _delete_source_vectors(id_prefix, namespace)

    # Per-document-type chunk sizes: smaller for tabular data (better cell precision),
    # larger for narrative text (better context preservation).
    _chunk_size, _chunk_overlap = CHUNK_SIZES.get(doc_type, (CHUNK_SIZE, CHUNK_OVERLAP))
    splitter = RecursiveCharacterTextSplitter(chunk_size=_chunk_size, chunk_overlap=_chunk_overlap)

    if raw_text is not None:
        # Clean extracted text before chunking (removes HTML, control chars, boilerplate)
        raw_text = _clean_text(raw_text)
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
                    "doc_type": doc_type,
                    "chunk_idx": i,
                },
            }
            for i, (chunk, emb) in enumerate(zip(text_chunks, embeddings))
        ]
        _get_index().upsert(vectors=vectors, namespace=namespace)
        return len(vectors)

    # LangChain Document path (TXT / MD / CSV)
    docs = loader.load()
    # Clean each document's page content before splitting
    for doc in docs:
        doc.page_content = _clean_text(doc.page_content)
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
                "doc_type": doc_type,
                "chunk_idx": i,
                "page": chunk.metadata.get("page", 0),
            },
        }
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]
    _get_index().upsert(vectors=vectors, namespace=namespace)
    return len(vectors)


def ingest_text(text: str, source: str = "manual", namespace: str = "default") -> int:
    # Delete existing vectors for this source before upserting
    _delete_source_vectors(source, namespace)
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
