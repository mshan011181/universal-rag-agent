FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl git \
    && rm -rf /var/lib/apt/lists/*

# Copy only the API-specific requirements (no Streamlit, no media tools)
COPY requirements-api.txt .

# Install CPU-only torch first (smaller than GPU version)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install API requirements
RUN pip install --no-cache-dir -r requirements-api.txt

COPY . .

# Create required runtime directories and set permissions
RUN mkdir -p /app/data/uploads /app/data/chroma && \
    useradd -m appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
