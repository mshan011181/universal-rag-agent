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
    && rm -rf /var/lib/apt/lists/*

COPY requirements-api.txt .

# CPU-only torch (smaller image; no GPU on Cloud Run)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir -r requirements-api.txt


COPY . .

RUN mkdir -p /app/data/uploads && \
    useradd -m appuser && \
    chown -R appuser:appuser /app

USER appuser

# Cloud Run injects PORT; fall back to 8000 for local docker-compose
ENV PORT=8000
EXPOSE ${PORT}

CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
