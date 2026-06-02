# 🧠 Universal RAG Agent

> Production-grade Retrieval-Augmented Generation system implementing **14 RAG patterns** in a single intelligent agent — powered by Groq Llama 3.3-70b, ChromaDB, LangChain, and Streamlit.

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![Groq](https://img.shields.io/badge/Groq-Llama%203.3--70b-orange)](https://groq.com/)
[![LangChain](https://img.shields.io/badge/LangChain-0.3.x-green)](https://langchain.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.55-red?logo=streamlit)](https://streamlit.io/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)

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

# JWT_SECRET — generate a secure random secret using the command below
JWT_SECRET=your_generated_secret_here
```

**Generate JWT_SECRET** — run this once in your terminal and paste the output:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Example output:
```
d435d9ce1e51eb94912ae5586230afed137c0cdf5d2929cf780171f9e20ef509
```

Copy that value and set it as `JWT_SECRET` in your `.env` file.

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

### Step 7 — Push Docker Images to Docker Hub

Once the stack is running and verified locally, push the images to Docker Hub. This lets you deploy the same image to any cloud VM or server without rebuilding from source.

```bash
# Log in to Docker Hub (one-time — prompts for your Docker Hub username and password)
docker login
```

```bash
# Tag both images with your Docker Hub username
docker tag universal_rag_agent-api mshan011181/universal-rag-agent-api:v1
docker tag universal_rag_agent-frontend mshan011181/universal-rag-agent-frontend:v1
```

```bash
# Push to Docker Hub
docker push mshan011181/universal-rag-agent-api:v1
docker push mshan011181/universal-rag-agent-frontend:v1
```

> First push takes **10–20 minutes** — images are 3+ GB each. Subsequent pushes only upload changed layers, which is much faster.

After pushing, your images are publicly available at:
- `https://hub.docker.com/r/mshan011181/universal-rag-agent-api`
- `https://hub.docker.com/r/mshan011181/universal-rag-agent-frontend`

Any machine (GCP VM, AWS EC2, a colleague's laptop) can now pull and run them with just `docker pull` — no source code or rebuild needed.

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

### Docker Services — Purpose & Use Cases

| Service | Port | Role in This System |
|---------|------|---------------------|
| api | 8000 | FastAPI backend + REST API |
| frontend | 8501 | Streamlit UI |
| postgres | 5432 | PostgreSQL — user accounts, sessions, audit logs |
| chromadb | 8001 | ChromaDB — semantic vector search |
| redis | 6379 | Redis — rate limiting, response cache |
| prometheus | 9090 | Metrics collection |
| grafana | 3001 | Monitoring dashboards |

#### FastAPI
FastAPI is the production REST API layer that sits between external clients and the RAG engine. It handles everything that the Streamlit UI does not — secure programmatic access, multi-tenancy, and enterprise integration.

**What it does here:**
- Exposes REST endpoints for query, ingest, auth, health, and admin operations
- Enforces JWT + OAuth2 authentication on every protected endpoint
- Applies per-endpoint rate limits (30 req/min for queries, 10 req/min for ingest)
- Writes a tamper-evident audit log of every query, who made it, and what pattern ran
- Emits Prometheus metrics (`/metrics`) for every request and RAG operation
- Runs health probes (`/health`, `/health/ready`) consumed by Docker and Kubernetes

**Why you need it alongside Streamlit:** Streamlit is for interactive human use. FastAPI is for machine-to-machine integrations — CI pipelines, internal tools, mobile apps, or any system that needs to query the RAG agent programmatically without a browser.

---

#### Grafana
Grafana is the visualization layer that turns raw Prometheus time-series data into interactive dashboards and alert rules.

**What it does here:**
- Renders live graphs of query volume, latency, quality scores, and pattern usage
- Shows which of the 14 RAG patterns are being invoked most frequently
- Tracks answer quality degradation over time (alerts when average score drops below 0.65)
- Monitors API error rates, p95/p99 response times, and cache hit ratios
- Sends alerts (Slack, email, PagerDuty) when thresholds are breached

**Typical dashboards to build:**
- RAG Query Overview — total queries, pattern distribution, quality score trend
- API Performance — request rate, latency histogram, error rate
- Ingestion Pipeline — documents indexed per hour, chunk counts
- Cache & Fallback — Redis hit rate, web search fallback frequency

---

#### Prometheus
Prometheus is the metrics collection and storage engine. It scrapes the FastAPI `/metrics` endpoint every 15 seconds and stores the data as time-series.

**What it does here:**
- Collects RAG-specific metrics: `rag_queries_total`, `rag_query_latency_seconds`, `rag_quality_score`, `rag_fallback_total`, `rag_cache_hits_total`
- Collects HTTP-level metrics via `prometheus-fastapi-instrumentator`: request counts, latencies, status codes
- Stores up to 15 days of metrics data locally (configurable)
- Powers all Grafana panels and alert rules via PromQL queries
- Enables SLO tracking — e.g., "99% of queries complete under 3 seconds"

**Why Prometheus over application logs:** Logs capture individual events. Prometheus captures aggregate rates and distributions over time — essential for spotting trends, setting alerts, and capacity planning.

---

#### Redis
Redis is an in-memory data store used for two purposes in this system: rate limiting and response caching.

**What it does here:**
- **Rate limiting** — the FastAPI middleware checks a sliding window counter in Redis on every request. If a client exceeds their limit (e.g., 30 queries/min), Redis returns the count and the API rejects the request with HTTP 429 before it ever hits the RAG engine.
- **Verified Knowledge Cache** — high-confidence answers (quality score ≥ 0.85) are stored in Redis with a TTL. Identical or near-identical queries served from cache in milliseconds instead of running the full RAG pipeline.
- **Session state** — stores ephemeral data that does not need to persist across restarts (token blacklists, temporary upload references).

**Why Redis over PostgreSQL for this:** Redis operates entirely in memory, making read/write latency sub-millisecond. Rate limit checks happen on every request — at scale, database round-trips for this would become a bottleneck.

---

#### ChromaDB
ChromaDB is the vector database that powers all semantic retrieval in this system. Every document, audio transcript, video transcript, and web page you ingest is converted to embeddings and stored here.

**What it does here:**
- Stores dense vector embeddings generated by `sentence-transformers/all-MiniLM-L6-v2` (runs locally, no API key needed)
- Serves approximate nearest-neighbor search — given a query embedding, returns the top-K most semantically similar chunks in milliseconds
- Maintains metadata alongside each chunk (source file name, page number, YouTube video ID, web URL) so sources can be cited in answers
- Persists data to `/app/data/chroma` — survives container restarts
- Powers 13 of the 14 RAG patterns (all except pure web-search fallback)

**Why ChromaDB over PostgreSQL pgvector:** ChromaDB is purpose-built for vector search with a clean Python API, embedded metadata filtering, and zero configuration. For this system's scale (millions of chunks), it provides better developer experience than adding pgvector extension to PostgreSQL.

---

#### PostgreSQL
PostgreSQL is the relational database for all structured, persistent application data that needs ACID guarantees.

**What it does here:**
- **User accounts** — stores hashed passwords, roles (user/admin), API keys, and registration timestamps
- **Audit log** — every query request is written to an append-only audit table: who queried, what they asked, which pattern ran, quality score, latency, timestamp
- **Multi-tenant isolation** — the schema (`infra/postgres/init.sql`) supports multiple organizations sharing one deployment, with row-level data separation
- **Session tokens** — stores refresh token records for JWT rotation
- **Usage statistics** — query counts and ingestion history per user/org for billing or quota enforcement

**Why PostgreSQL alongside ChromaDB:** ChromaDB handles unstructured vector data. PostgreSQL handles structured relational data (users, auth, audit). They serve different access patterns — you would not store an audit log in a vector database, and you would not do semantic similarity search in PostgreSQL.

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

## 🧪 Testing

The test suite validates that the core logic of the RAG agent works correctly before any code change is merged or deployed. Tests run automatically in the CI/CD pipeline on every push — if they fail, the Docker build and deployment are blocked.

### What Is Being Tested

| Test File | What It Covers |
|-----------|----------------|
| `test_security.py` | Prompt injection detection, PII masking, input sanitization — ensures malicious inputs are caught before reaching the LLM |
| `test_query_analyzer.py` | The 5-dimension query analyzer — verifies that a given query is correctly classified by length, ambiguity, complexity, data type, and conversation state |
| `test_api.py` | FastAPI endpoints — registers a test user, obtains a JWT token, submits queries, uploads files, and checks that auth, rate limits, and responses behave as expected |

### Why This Matters

Without tests, a code change to the query analyzer could silently break pattern routing — and you would only discover it when users get wrong answers. The tests catch regressions early, in seconds, before anything reaches production.

### Running the Tests

```bash
# Install test dependencies (pytest, coverage tools)
pip install -r requirements-dev.txt

# Run all tests with a coverage report
pytest tests/ --cov=src --cov-report=term-missing

# Run individual test files
pytest tests/test_security.py
pytest tests/test_query_analyzer.py
pytest tests/test_api.py
```

The coverage report shows which lines of code in `src/` are exercised by tests and which are not. Example output:

```
Name                          Stmts   Miss  Cover
-------------------------------------------------
src/query_analyzer.py            85      6    93%
src/security.py                  62      4    94%
src/agent.py                    140     28    80%
-------------------------------------------------
TOTAL                           287     38    87%
```

### Coverage Gate

**80% minimum** is enforced in CI. If a new code change drops total coverage below 80%, the pipeline fails and the change cannot be merged. This ensures that as the codebase grows, test coverage keeps pace with new features.

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

## ☁️ Deploy to GCP Cloud VM

The Docker images built on your Windows machine work directly on a GCP Linux VM — no changes to the Dockerfile or docker-compose.yml are needed. This is because Docker Desktop on Windows uses WSL2 (a Linux kernel) to build images, so the output is already a standard `linux/amd64` image, which is the same architecture GCP VMs run on.

**What you do need to transfer to the VM:** only two files — your `.env` and `docker-compose.yml`. Everything else (all code, dependencies, models) is already baked into the images.

---

### Step 1 — Choose and Create a GCP VM

In GCP Console → Compute Engine → Create Instance:

| Setting | Recommended Value |
|---------|------------------|
| Machine type | `e2-standard-4` (4 vCPU, 16 GB RAM) |
| OS | Ubuntu 22.04 LTS |
| Boot disk | 50 GB SSD |
| Region | Choose closest to your users |
| Firewall | Allow HTTP and HTTPS traffic |

> **Why 16 GB RAM?** The API image (3.15 GB) and frontend image (3.5 GB) both load PyTorch and sentence-transformers into memory at runtime. PostgreSQL, Redis, ChromaDB, Prometheus, and Grafana each add overhead. 8 GB RAM is too tight — the VM will OOM-kill containers under load.

---

### Step 2 — Open Required Ports in GCP Firewall

In GCP Console → VPC Network → Firewall → Create Firewall Rule:

| Port | Service | Rule Name |
|------|---------|-----------|
| 8000 | FastAPI | allow-rag-api |
| 8501 | Streamlit UI | allow-rag-ui |
| 9090 | Prometheus | allow-prometheus |
| 3001 | Grafana | allow-grafana |
| 8001 | ChromaDB | allow-chromadb |

Set **Targets** to "All instances" and **Source IP ranges** to `0.0.0.0/0` (or restrict to your IP for security).

---

### Step 3 — Install Docker on the GCP VM

SSH into your VM from GCP Console, then run:

```bash
# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose

# Allow your user to run Docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker-compose --version
```

---

### Step 4 — Push Your Images to Docker Hub

Run these commands on your **local Windows machine**:

```bash
# Log in to Docker Hub
docker login

# Tag the images with your Docker Hub username
docker tag universal_rag_agent-api mshan011181/universal-rag-agent-api:v1
docker tag universal_rag_agent-frontend mshan011181/universal-rag-agent-frontend:v1

# Push to Docker Hub
docker push mshan011181/universal-rag-agent-api:v1
docker push mshan011181/universal-rag-agent-frontend:v1
```

> First push will take 10–20 minutes — the images are 3+ GB each. Subsequent pushes only upload changed layers (much faster).

---

### Step 5 — Update docker-compose.yml for the VM

On the GCP VM, you need a slightly modified `docker-compose.yml` that **pulls from Docker Hub** instead of building from source (there is no source code on the VM — only the images):

```bash
# On your GCP VM — create the project directory
mkdir ~/universal-rag-agent && cd ~/universal-rag-agent
```

Create `docker-compose.yml` on the VM with these two services changed:

```yaml
services:
  api:
    image: mshan011181/universal-rag-agent-api:v1   # pull from Docker Hub
    ports:
      - "8000:8000"
    environment:
      - GROQ_API_KEY=${GROQ_API_KEY}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
      - COHERE_API_KEY=${COHERE_API_KEY}
      - DATABASE_URL=postgresql://raguser:ragpass@postgres:5432/ragdb
      - REDIS_URL=redis://redis:6379/0
      - CHROMA_HOST=chromadb
      - CHROMA_PORT=8001
      - JWT_SECRET=${JWT_SECRET}
      - ENVIRONMENT=production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      chromadb:
        condition: service_started
    volumes:
      - uploads:/app/data/uploads
    restart: unless-stopped

  frontend:
    image: mshan011181/universal-rag-agent-frontend:v1   # pull from Docker Hub
    ports:
      - "8501:8501"
    environment:
      - GROQ_API_KEY=${GROQ_API_KEY}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
      - COHERE_API_KEY=${COHERE_API_KEY}
    volumes:
      - uploads:/app/data/uploads
    restart: unless-stopped

  # postgres, chromadb, redis, prometheus, grafana remain exactly the same
  # as your local docker-compose.yml — copy them unchanged
```

> **The only change:** `build: .` is replaced with `image: mshan011181/...` for the api and frontend services. All other services (postgres, redis, chromadb, prometheus, grafana) use public images and stay identical.

---

### Step 6 — Copy Your .env to the VM

```bash
# From your local machine — copy .env to the VM
# Replace <vm-external-ip> with your GCP VM's external IP
scp .env username@<vm-external-ip>:~/universal-rag-agent/.env
```

Or paste the contents manually via the GCP SSH browser terminal.

---

### Step 7 — Start All Services on the VM

```bash
cd ~/universal-rag-agent

# Pull all images (Docker Hub for api/frontend, public registries for the rest)
docker-compose pull

# Start all 7 services
docker-compose up -d

# Verify all are running
docker-compose ps
```

---

### Step 8 — Access the Running Services

Replace `<vm-external-ip>` with your GCP VM's External IP (found in Compute Engine → VM instances):

| Service | URL |
|---------|-----|
| Streamlit UI | `http://<vm-external-ip>:8501` |
| FastAPI Swagger | `http://<vm-external-ip>:8000/api/docs` |
| Prometheus | `http://<vm-external-ip>:9090` |
| Grafana | `http://<vm-external-ip>:3001` |

---

### No Changes Needed in Dockerfile

| Concern | Answer |
|---------|--------|
| Built on Windows, runs on Linux? | Yes — WSL2 builds `linux/amd64` images, same as GCP VMs |
| OS-specific paths? | No — all paths use `/app/...` (Linux-style), already correct |
| CPU-only PyTorch? | Yes — GCP VMs are CPU-only by default, this is the right build |
| Environment variables? | Passed via `.env` and `docker-compose.yml`, no hardcoding |
| Data persistence? | Docker named volumes (`pgdata`, `chromadata`, etc.) work the same on Linux |

---

### Updating the App on the VM (When You Release a New Version)

```bash
# On your local machine — rebuild and push new version
docker-compose build
docker tag universal_rag_agent-api mshan011181/universal-rag-agent-api:v2
docker tag universal_rag_agent-frontend mshan011181/universal-rag-agent-frontend:v2
docker push mshan011181/universal-rag-agent-api:v2
docker push mshan011181/universal-rag-agent-frontend:v2

# On the GCP VM — pull and restart
docker-compose pull
docker-compose up -d
```

Only the changed layers are downloaded — not the full 3 GB image each time.

---

Kubernetes takes the Docker Compose stack and makes it production-grade: self-healing pods, horizontal auto-scaling, rolling zero-downtime deploys, and liveness/readiness probes that Kubernetes uses to restart unhealthy containers automatically.

**When to use Kubernetes instead of Docker Compose:**
- You need to scale the API horizontally under load (multiple pod replicas)
- You are running in a cloud environment (GKE, EKS, AKS)
- You need guaranteed uptime with automatic pod restarts on failure
- You need rolling deploys — update the image with zero downtime

### Deploy to Kubernetes

```bash
# Step 1 — Create secrets (never commit these to Git)
kubectl create secret generic rag-secrets \
  --from-literal=groq-api-key=<your_groq_key> \
  --from-literal=jwt-secret=<your_jwt_secret> \
  --from-literal=database-url=postgresql+asyncpg://rag:ragpass@postgres:5432/ragdb

# Step 2 — Apply the deployment manifest
kubectl apply -f infra/k8s/deployment.yml

# Step 3 — Verify pods are running
kubectl get pods -l app=universal-rag-agent

# Step 4 — Check the HPA status
kubectl get hpa universal-rag-agent-hpa
```

### Auto-Scaling (HPA)

The Horizontal Pod Autoscaler is configured to:

| Setting | Value |
|---------|-------|
| Minimum replicas | 2 |
| Maximum replicas | 10 |
| Scale up trigger | CPU > 70% or Memory > 80% |
| Scale down stabilization | 5 minutes (prevents flapping) |
| Update strategy | RollingUpdate (zero downtime) |

With 2 minimum replicas, there is always a standby pod to absorb traffic spikes without the user seeing latency while a new pod cold-starts.

### Health Probes

Kubernetes uses the FastAPI health endpoints to manage pod lifecycle:

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 8000
  initialDelaySeconds: 15
  periodSeconds: 5
```

- **Liveness probe** — if `/health` fails 3 times, Kubernetes restarts the container
- **Readiness probe** — if `/health/ready` fails, Kubernetes stops routing traffic to that pod until it recovers (used during startup and rolling deploys)

### Useful kubectl Commands

```bash
# View logs from all API pods
kubectl logs -l app=universal-rag-agent -f

# Scale manually (overrides HPA temporarily)
kubectl scale deployment universal-rag-agent --replicas=5

# Rolling update after pushing a new image
kubectl set image deployment/universal-rag-agent api=<your-registry>/universal-rag-agent:v2

# Check rollout status
kubectl rollout status deployment/universal-rag-agent

# Roll back if the new version has issues
kubectl rollout undo deployment/universal-rag-agent
```

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

Copyright (c) 2025 Shan. All rights reserved.

Viewing and downloading this code is permitted for reference and educational purposes only. Modification, redistribution, commercial use, and derivative works are strictly prohibited without prior written permission from the author.

See [LICENSE](LICENSE) for full terms.

---

## 👤 Author

**Shan** — AI Engineer

Built with ❤️ using Groq, LangChain, ChromaDB, and Streamlit.

🔗 **GitHub:** [https://github.com/mshan011181/universal-rag-agent](https://github.com/mshan011181/universal-rag-agent)
