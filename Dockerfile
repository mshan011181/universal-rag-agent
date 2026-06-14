FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl git \
    # OCR — pytesseract wrapper calls this binary
    tesseract-ocr \
    tesseract-ocr-eng \
    # Poppler — pdf2image calls pdftoppm from this package
    poppler-utils \
    # Image processing support for Pillow
    libgl1 libglib2.0-0 \
    # ffmpeg — audio/video ingestion
    ffmpeg \
    # LibreOffice — convert legacy .ppt/.doc/.xls to modern formats
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-api.txt .

# CUDA torch — the marker-ingest Job runs on an L4 GPU (TORCH_DEVICE=cuda) for
# ~10x faster STEM conversion. The same image is used by the CPU-only API,
# where CUDA torch runs fine on CPU (no GPU present → falls back automatically).
RUN pip install --no-cache-dir torch

RUN pip install --no-cache-dir -r requirements-api.txt

# marker-pdf (STEM PDF parser). Install WITH its full dependency tree using
# the legacy resolver. The legacy resolver does not backtrack, so it avoids
# the ResolutionTooDeep error the new resolver hits on marker's pre-commit→
# virtualenv chain — while still pulling every runtime dep (pydantic-settings,
# click, surya-ocr, pdftext, google-genai, etc.). --no-deps previously left
# import-time deps missing, so `import marker` failed silently.
RUN pip install --no-cache-dir --use-deprecated=legacy-resolver marker-pdf

# Bake the embedding model into the image so it never downloads at runtime.
# The scale-to-zero Marker Job starts on a fresh instance with no HF cache; a
# runtime download of all-MiniLM-L6-v2 failed there with a connection error.
# Pre-caching also speeds API cold starts. Both API and Job read from this path
# via SENTENCE_TRANSFORMERS_HOME (ENV persists into every container).
ENV SENTENCE_TRANSFORMERS_HOME=/app/models
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY . .

RUN mkdir -p /app/data/uploads && \
    useradd -m appuser && \
    chown -R appuser:appuser /app && \
    # Marker/surya write a `static` dir + fonts under site-packages at runtime;
    # the non-root appuser needs write access there or conversion fails with
    # PermissionError: '/usr/local/lib/python3.12/site-packages/static'.
    chown -R appuser:appuser /usr/local/lib/python3.12/site-packages

USER appuser

# Cloud Run injects PORT; fall back to 8000 for local docker-compose
ENV PORT=8000
EXPOSE ${PORT}

CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
