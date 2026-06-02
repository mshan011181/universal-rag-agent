# 🧠 Universal RAG Agent

> Production-grade Retrieval-Augmented Generation system implementing **14 RAG patterns** in a single intelligent agent — powered by Groq Llama 3.3-70b, ChromaDB, LangChain, and Streamlit.

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![Groq](https://img.shields.io/badge/Groq-Llama%203.3--70b-orange)](https://groq.com/)
[![LangChain](https://img.shields.io/badge/LangChain-0.3.x-green)](https://langchain.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.55-red?logo=streamlit)](https://streamlit.io/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

---

## 📌 Overview

The Universal RAG Agent is a self-improving, multi-pattern RAG system that **automatically selects the optimal retrieval strategy** for every query using a 5-dimension query analyzer. Rather than being locked into a single RAG approach, the agent routes each query through the best-fit pattern — or chains multiple patterns together — based on query length, ambiguity, complexity, data type, and conversation state.

Built for real enterprise use: ships with JWT authentication, rate limiting, audit logging, Kubernetes deployment, Prometheus metrics, and a full CI/CD pipeline.

---

## ✨ Key Features

- **14 RAG Patterns** — all implemented and selectable per query
- **5-Dimension Query Analyzer** — intelligently routes each query to the right pattern(s)
- **Multi-modal Ingestion** — PDF, DOCX, TXT, Audio, Video, Web Pages, YouTube links
- **Groq Whisper** — audio/video transcription built-in (whisper-large-v3)
- **Self-Improving Memory** — tracks pattern performance, routing signals, verified knowledge
- **Production API** — FastAPI with JWT + OAuth2 + API Key auth, rate limiting, audit log
- **Observability** — Prometheus metrics, Grafana dashboards, structured logging
- **Kubernetes Ready** — HPA auto-scaling (2–10 pods), rolling updates, health probes
- **CI/CD** — GitHub Actions pipeline: lint → typecheck → security → test → build → deploy

---

## 🔄 The 14 RAG Patterns

| # | Pattern | Best For |
|---|---------|----------|
| 1 | **Naive RAG** | Simple factual queries with clear indexed answers |
| 2 | **HyDE** | Very short or highly ambiguous queries |
| 3 | **Query Rewriting** | Vague or poorly phrased queries |
| 4 | **CRAG** | High-risk domains (legal, medical, financial, compliance) |
| 5 | **Self-RAG** | Complex multi-step reasoning requiring self-verification |
| 6 | **Adaptive RAG** | Mixed-complexity workloads needing dynamic strategy |
| 7 | **FLARE** | Long-form generation requiring iterative retrieval |
| 8 | **Speculative RAG** | Queries benefiting from hypothesis-then-verify approach |
| 9 | **Modular RAG** | Queries requiring configurable retrieval pipelines |
| 10 | **Agentic RAG** | Multi-tool, multi-step research tasks |
| 11 | **GraphRAG** | Entity-relationship and network-style queries |
| 12 | **Multi-Modal RAG** | Image/chart analysis (text-based fallback active) |
| 13 | **Conversational RAG** | Follow-up questions with conversation history |
| 14 | **RAG Fusion** | Broad queries benefiting from multi-perspective retrieval |

---

## 🗂️ Project Structure

```
universal-rag-agent/
├── app.py                        # Streamlit UI (dev entry point)
├── Dockerfile
├── docker-compose.yml
├── requirements.txt              # Core dependencies
├── requirements-dev.txt          # Dev/test tools
├── requirements-prod.txt         # Production extras
├── setup.sh
├── .env.example
│
├── src/
│   ├── agent.py                  # Main orchestrator
│   ├── config.py                 # All paths, models, thresholds
│   ├── models.py                 # RAGAgentResponse dataclass
│   ├── pattern_router.py         # Routes queries to patterns
│   ├── query_analyzer.py         # 5-dimension analyzer
│   ├── security.py               # Prompt injection + PII detection
│   ├── observability.py          # Prometheus metrics + structlog
│   │
│   ├── patterns/                 # 14 RAG pattern implementations
│   │   ├── naive_rag.py
│   │   ├── hyde.py
│   │   ├── query_rewriting.py
│   │   ├── crag.py
│   │   ├── self_rag.py
│   │   ├── rag_fusion.py
│   │   ├── conv_rag.py
│   │   ├── agentic_rag.py
│   │   ├── flare.py
│   │   ├── speculative_rag.py
│   │   ├── graph_rag.py
│   │   └── multimodal_rag.py
│   │
│   ├── retrieval/
│   │   ├── vector_store.py       # ChromaDB operations
│   │   ├── media_ingest.py       # Audio/video/web/YouTube ingestion
│   │   ├── web_search.py         # Tavily fallback search
│   │   └── reranker.py           # Cohere reranking + RRF
│   │
│   ├── generation/
│   │   └── llm.py                # 4 LLM roles: synthesizer, grader, verifier, judge
│   │
│   └── memory/
│       └── sqlite_store.py       # 4-layer memory store
│
├── api/                          # Production FastAPI app
│   ├── main.py
│   ├── auth_utils.py
│   ├── middleware/
│   │   ├── rate_limit.py
│   │   └── audit.py
│   └── routers/
│       ├── auth.py
│       ├── query.py
│       ├── ingest.py
│       ├── health.py
│       └── admin.py
│
├── infra/
│   ├── k8s/deployment.yml        # Kubernetes Deployment + Service + HPA
│   └── postgres/init.sql         # Multi-tenant DB schema
│
├── tests/
│   ├── conftest.py
│   ├── test_security.py
│   ├── test_query_analyzer.py
│   └── test_api.py
│
└── .github/
    └── workflows/ci.yml          # GitHub Actions CI/CD pipeline
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.12+
- [Groq API Key](https://console.groq.com/) — free tier available
- ffmpeg for video ingestion: `winget install ffmpeg` on Windows / `brew install ffmpeg` on Mac

### 1. Clone and Install

```bash
git clone https://github.com/mshan011181/universal-rag-agent.git
cd universal-rag-agent
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=your_groq_key_here
TAVILY_API_KEY=your_tavily_key_here     # optional — enables web search fallback
COHERE_API_KEY=your_cohere_key_here     # optional — enables cross-encoder reranking
```

### 3. Run the App

```bash
streamlit run app.py
```

Open [http://localhost:8501](http://localhost:8501)

---

## 🎛️ Usage

### Ingesting Content

Upload or provide content from the sidebar:

| Input Type | Formats | How |
|------------|---------|-----|
| Documents | PDF, TXT, DOCX | File uploader → Ingest Documents |
| Audio | MP3, WAV, M4A, OGG, FLAC, WEBM | File uploader → Transcribe & Index Audio |
| Video | MP4, AVI, MKV, MOV, WMV | File uploader → Transcribe & Index Video |
| Web Page | Any URL | Paste URL → Fetch & Index URL |
| YouTube | youtube.com or youtu.be links | Paste URL → Fetch & Index URL |
| Plain Text | Any text | Paste in text box → Index Text |

### Querying

Type any question in the chat panel. The agent will:

1. Analyze the query across 5 dimensions
2. Select and chain the optimal RAG pattern(s)
3. Retrieve, rerank, and synthesize an answer
4. Display confidence score, sources, patterns used, and latency

---

## 🏗️ Architecture

```
Query Input
     │
     ▼
┌──────────────────────┐
│    Query Analyzer    │  5 dimensions: length, ambiguity,
│    (5-dimension)     │  complexity, data_type, conv_state
└──────────┬───────────┘
           │
     Pattern Selection
           │
     ┌─────▼──────┐
     │  Pattern   │  Sequential chaining or parallel fan-out
     │  Router    │
     └─────┬──────┘
           │
  ┌────────▼────────┐    ┌────────────┐    ┌──────────────┐
  │   Retrieval     │───▶│  Reranker  │───▶│  Generation  │
  │ (ChromaDB +     │    │ (RRF /     │    │  (Groq LLM)  │
  │  Web Search)    │    │  Cohere)   │    │  4 LLM roles │
  └─────────────────┘    └────────────┘    └──────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │    Memory     │
                                          │  (4 layers)   │
                                          └───────────────┘
```

### 4 LLM Roles (all using Groq Llama 3.3-70b)

| Role | Responsibility |
|------|----------------|
| **Synthesizer** | Generates the final answer from retrieved chunks |
| **Grader** | Scores answer quality (0.0–1.0) |
| **Verifier** | Checks faithfulness to source context |
| **Judge** | Resolves conflicting information across sources |

### 4 Memory Layers

| Layer | Purpose |
|-------|---------|
| **Conversation History** | Tracks dialogue context per session |
| **Pattern Performance** | Learns which patterns work best per query type |
| **Routing Signals** | Improves future routing decisions |
| **Verified Knowledge Cache** | Stores high-confidence answers for reuse |

---

## 🌐 Media & URL Ingestion

### YouTube

1. Extracts video ID from URL
2. Downloads subtitle file (`.json3`) via `yt-dlp` — no full video download, instant
3. If no captions → downloads audio → transcribes with Groq Whisper (whisper-large-v3)
4. Indexes transcript into ChromaDB with source label `youtube:<video_id>`

### Audio & Video

- MP4, MP3, WAV, M4A, OGG, FLAC, WEBM → sent directly to Groq Whisper API
- AVI, MKV, MOV, WMV → `ffmpeg` extracts audio to mp3 first, then Groq Whisper
- Temporary files cleaned up automatically after transcription

### Web Pages

- `trafilatura` fetches and extracts clean article text
- Strips navigation, ads, and boilerplate automatically
- Source label stored as `web:<domain><path>`

---

## 🔐 Production API

Run the FastAPI backend:

```bash
pip install -r requirements-prod.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | None | Register new user |
| `/api/auth/token` | POST | None | Get JWT access token |
| `/api/auth/refresh` | POST | JWT | Refresh access token |
| `/api/query/` | POST | JWT or API Key | Submit a RAG query |
| `/api/ingest/file` | POST | JWT or API Key | Upload and index a file |
| `/api/ingest/text` | POST | JWT or API Key | Index raw text |
| `/api/health` | GET | None | Liveness probe |
| `/api/health/ready` | GET | None | Readiness probe |
| `/api/admin/stats` | GET | Admin JWT | System statistics |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/api/query` | 30 req/min |
| `/api/ingest` | 10 req/min |
| `/api/auth` | 20 req/min |
| Default | 100 req/min |

---

## 🐳 Production Deployment — Docker Stack

### Prerequisites

- Docker Desktop installed and **running** (whale icon steady in system tray)
- `.env` file configured (see Environment Variables section)
- At least 6 GB RAM allocated to Docker / WSL2

### Step 1 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
GROQ_API_KEY=your_groq_key_here

# Optional
TAVILY_API_KEY=
COHERE_API_KEY=

# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=your_generated_secret_here
```

### Step 2 — Build and Start All Services

```bash
docker-compose up -d --build
```

> First run takes **3–5 minutes** to build images and pull dependencies. Subsequent runs are instant.

### Step 3 — Verify All Services Are Healthy

```bash
docker-compose ps
```

Expected output — all 7 services up:

```
NAME                              STATUS
universal_rag_agent-api-1         Up (healthy)
universal_rag_agent-frontend-1    Up
universal_rag_agent-postgres-1    Up (healthy)
universal_rag_agent-chromadb-1    Up
universal_rag_agent-redis-1       Up (healthy)
universal_rag_agent-prometheus-1  Up
universal_rag_agent-grafana-1     Up
```

### Step 4 — Access the Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **Streamlit UI** | http://localhost:8501 | — |
| **FastAPI Swagger** | http://localhost:8000/api/docs | — |
| **Prometheus** | http://localhost:9090 | — |
| **Grafana** | http://localhost:3001 | admin / admin |
| **ChromaDB** | http://localhost:8001 | — |

### Step 5 — Test the API

1. Open http://localhost:8000/api/docs
2. **Register a user** → `POST /api/auth/register`
3. **Get JWT token** → `POST /api/auth/token`
4. Click **Authorize** (top right) → paste the token
5. **Submit a query** → `POST /api/query/`

### Step 6 — Set Up Grafana Dashboard

1. Open http://localhost:3001 → login: `admin` / `admin`
2. Go to **Connections → Data Sources → Add → Prometheus**
3. URL: `http://prometheus:9090`
4. Click **Save & Test**
5. Go to **Dashboards → New** → add panels (see Prometheus section below)

### Useful Commands

```bash
# View logs for a specific service
docker-compose logs -f api
docker-compose logs -f frontend

# Restart a single service
docker-compose restart api

# Rebuild a single service only
docker-compose up -d --build api

# Stop all services
docker-compose down

# Stop and remove all data volumes (full reset)
docker-compose down -v

# Check resource usage
docker stats
```

### Docker Services

| Service | Port | Description |
|---------|------|-------------|
| api | 8000 | FastAPI backend + REST API |
| frontend | 8501 | Streamlit UI |
| postgres | 5432 | PostgreSQL database |
| chromadb | 8001 | ChromaDB vector store |
| redis | 6379 | Cache |
| prometheus | 9090 | Metrics collection |
| grafana | 3001 | Monitoring dashboards |

### WSL2 Memory Configuration (Windows)

If Docker Desktop crashes during build, increase WSL2 memory by creating/editing `C:\Users\<username>\.wslconfig`:

```ini
[wsl2]
memory=6GB
processors=4
swap=4GB
```

Then restart WSL: `wsl --shutdown` and reopen Docker Desktop.

---

## ☸️ Kubernetes

```bash
# Create secrets
kubectl create secret generic rag-secrets \
  --from-literal=groq-api-key=<your_key> \
  --from-literal=jwt-secret=<your_secret> \
  --from-literal=database-url=<your_db_url>

# Deploy
kubectl apply -f infra/k8s/deployment.yml
```

The HPA scales between **2 and 10 pods** based on CPU (70%) and memory (80%) utilization with zero-downtime rolling updates.

---

## 🧪 Testing

```bash
pip install -r requirements-dev.txt

# Run all tests with coverage report
pytest tests/ --cov=src --cov-report=term-missing

# Individual suites
pytest tests/test_security.py
pytest tests/test_query_analyzer.py
pytest tests/test_api.py
```

Coverage gate: **80% minimum** enforced in CI.

---

## 📊 Observability — Prometheus & Grafana

Prometheus scrapes the `/metrics` endpoint of the API every 15 seconds and stores time-series data.

### Available Metrics

| Metric | What It Tracks |
|--------|----------------|
| `rag_queries_total` | Total queries by pattern and status |
| `rag_query_latency_seconds` | How long each query takes |
| `rag_quality_score` | Distribution of answer quality scores (0.0–1.0) |
| `rag_fallback_total` | How many times web search fallback triggered |
| `rag_cache_hits_total` | Verified knowledge cache hit rate |
| `rag_chunk_count` | Chunks retrieved per query |
| `http_requests_total` | All API requests by endpoint and status code |
| `http_request_duration_seconds` | API response time histogram |

### Prometheus Queries (localhost:9090)

```promql
# Total queries made
rag_queries_total

# Average query latency
rate(rag_query_latency_seconds_sum[5m]) / rate(rag_query_latency_seconds_count[5m])

# Average answer quality score
rate(rag_quality_score_sum[5m]) / rate(rag_quality_score_count[5m])

# API request rate per second
rate(http_requests_total[1m])

# Fallback rate (how often web search kicks in)
rate(rag_fallback_total[5m])

# Cache hit rate
rate(rag_cache_hits_total[5m])
```

### Practical Use Cases

| Use Case | Query |
|----------|-------|
| Which RAG pattern is used most? | `rag_queries_total` grouped by `pattern` label |
| Is query quality dropping? | Alert when `rag_quality_score` avg drops below 0.65 |
| API is slow? | `http_request_duration_seconds` p95/p99 |
| Cache effectiveness? | `rag_cache_hits_total` over time |
| Pattern failure rate? | `rag_queries_total` filtered by `status=failed` |

### Grafana Setup

1. Open http://localhost:3001 → login: `admin` / `admin`
2. **Connections → Data Sources → Add → Prometheus**
3. URL: `http://prometheus:9090` → **Save & Test**
4. **Dashboards → New** → add panels using the queries above

This gives real-time graphs of query volume, latency, quality scores, and pattern usage — all updating live as users interact with the RAG agent.

---

## ⚙️ Configuration

Key settings in `src/config.py`:

```python
GROQ_MODEL         = "llama-3.3-70b-versatile"
EMBEDDING_MODEL    = "all-MiniLM-L6-v2"    # local, no API key needed
CHUNK_SIZE         = 1000
CHUNK_OVERLAP      = 200
TOP_K              = 5
QUALITY_THRESHOLD  = 0.65
HIGH_CONFIDENCE    = 0.85
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key — used for LLM and Whisper |
| `TAVILY_API_KEY` | Optional | Web search fallback (CRAG pattern) |
| `COHERE_API_KEY` | Optional | Cross-encoder reranking |
| `JWT_SECRET` | Production | JWT token signing secret |
| `DATABASE_URL` | Production | PostgreSQL connection string |
| `ENVIRONMENT` | Production | Set to `production` |

---

## 🛣️ CI/CD Pipeline

```
push
 └─▶ Lint (ruff)
      └─▶ Type Check (mypy)
           └─▶ Security Scan (bandit)
                └─▶ Tests (pytest, 80% coverage gate)
                     └─▶ Build Docker Image
                          └─▶ Deploy to Staging
                               └─▶ Deploy to Production
```

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | Groq Llama 3.3-70b-versatile |
| Transcription | Groq Whisper large-v3 |
| Orchestration | LangChain 0.3.x + LangGraph |
| Vector Store | ChromaDB |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2, local) |
| API | FastAPI + uvicorn |
| UI | Streamlit |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Cache | Redis |
| Database | PostgreSQL (asyncpg + SQLAlchemy async) |
| Observability | Prometheus + Grafana + structlog |
| Reranking | Cohere cross-encoder + Reciprocal Rank Fusion |
| Web Ingestion | trafilatura |
| YouTube | yt-dlp |
| Graph | NetworkX |
| Container | Docker + Kubernetes (HPA) |
| CI/CD | GitHub Actions |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Shan** — AI Engineer

Built with ❤️ using Groq, LangChain, ChromaDB, and Streamlit.

🔗 **GitHub:** [https://github.com/mshan011181/universal-rag-agent](https://github.com/mshan011181/universal-rag-agent)
