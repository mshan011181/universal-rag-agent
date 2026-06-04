# Universal RAG Agent Enterprise

> Production-grade Retrieval-Augmented Generation system implementing **14 RAG patterns** in a single intelligent agent — auto-scales from 1 to 100 containers on **Google Cloud Run**, backed by **Pinecone**, **Cloud SQL**, **Memorystore**, and **Vertex AI Claude**.

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![Cloud Run](https://img.shields.io/badge/Cloud%20Run-Auto--scaling-4285F4?logo=googlecloud)](https://cloud.google.com/run)
[![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-green)](https://www.pinecone.io/)
[![Vertex AI](https://img.shields.io/badge/Vertex%20AI-Claude-orange)](https://cloud.google.com/vertex-ai)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.55-red?logo=streamlit)](https://streamlit.io/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)

---

## Overview

The Universal RAG Agent automatically selects the optimal retrieval strategy for every query using a **5-dimension query analyzer**. Rather than being locked into a single RAG approach, it routes each query through the best-fit pattern — or chains multiple patterns — based on query length, ambiguity, complexity, data type, and conversation state.

### Before vs After — Infrastructure

```
BEFORE (Single VM — breaks at scale)          AFTER (Managed Services — scales automatically)

All Enterprises                               All Enterprises
      │                                             │
      ▼                                             ▼
   GCP VM                                  Cloud Load Balancer
   ├── FastAPI container    ~50 concurrent         │
   ├── Streamlit container  ~20 concurrent          ▼
   ├── ChromaDB container   slows/crashes   Cloud Run (FastAPI)    1 → 100 containers
   ├── PostgreSQL container hits conn limit  Cloud Run (Streamlit)  1 → 100 containers
   └── Redis container      runs OOM               │
                                             ├── Pinecone          unlimited vectors
                                             ├── Cloud SQL         4000 connections, 64TB
                                             ├── Memorystore       300GB, sharded
                                             └── Vertex AI Claude  no rate limits
```

---

## Key Features

- **14 RAG Patterns** — all implemented and auto-selected per query
- **5-Dimension Query Analyzer** — routes each query to the right pattern(s)
- **Multi-modal Ingestion** — PDF, DOCX, TXT, Audio, Video, Web Pages, YouTube
- **Groq Whisper** — audio/video transcription (whisper-large-v3)
- **Self-Improving Memory** — tracks pattern performance, routing signals, verified knowledge
- **LLM Provider Switching** — `LLM_PROVIDER=groq` for local dev, `LLM_PROVIDER=vertexai` for production
- **Production API** — FastAPI with JWT + OAuth2 + API Key auth, Redis-backed rate limiting, audit log
- **Observability** — Prometheus metrics, Grafana dashboards, structured logging
- **Cloud Run Auto-scaling** — 1 to 100 containers, zero infrastructure management
- **Cloud Build CI/CD** — lint → typecheck → security → tests → build → deploy (images only built after green tests)

---

## The 14 RAG Patterns

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
| 12 | **Multi-Modal RAG** | Image/chart analysis |
| 13 | **Conversational RAG** | Follow-up questions with conversation history |
| 14 | **RAG Fusion** | Broad queries benefiting from multi-perspective retrieval |

---

## Tech Stack

| Layer | Local Dev | Production |
|-------|-----------|------------|
| **LLM** | Groq Llama 3.3-70b (`LLM_PROVIDER=groq`) | Vertex AI Claude Sonnet (`LLM_PROVIDER=vertexai`) |
| **Vector DB** | Pinecone (same in both) | Pinecone — unlimited, per-tenant namespaces |
| **Relational DB** | PostgreSQL container | Cloud SQL PostgreSQL — 4000 conns, auto-failover, 64TB |
| **Cache / Rate limit** | Redis container | Memorystore — 300GB, persistent, sharded |
| **API** | FastAPI + uvicorn | Cloud Run (1–100 containers auto-scale) |
| **UI** | Streamlit | Cloud Run (1–100 containers auto-scale) |
| **Embeddings** | sentence-transformers all-MiniLM-L6-v2 (local) | Same — no API key needed |
| **Transcription** | Groq Whisper large-v3 | Same |
| **Orchestration** | LangChain 0.3.x + LangGraph | Same |
| **Auth** | JWT (python-jose) + bcrypt | Same, secrets in Secret Manager |
| **Observability** | Prometheus + Grafana + structlog | Same + Cloud Logging |
| **Reranking** | Cohere cross-encoder + RRF | Same |
| **CI/CD** | `scripts/build_and_test.sh` (local) | Cloud Build (`cloudbuild.yaml`) |
| **Container Registry** | Docker Hub | Artifact Registry |

---

## Project Structure

```
universal-rag-agent-enterprise/
├── app.py                            # Streamlit UI entry point
├── Dockerfile                        # API image (Cloud Run PORT env var aware)
├── Dockerfile.streamlit              # Frontend image
├── docker-compose.yml                # Local dev stack (postgres + redis containers)
├── cloudbuild.yaml                   # Cloud Build CI/CD pipeline (12 stages)
├── pytest.ini                        # Test config — 70% coverage gate
├── requirements.txt                  # Core dependencies (pinecone, not chromadb)
├── requirements-api.txt              # API container deps
├── requirements-streamlit.txt        # Frontend container deps
├── requirements-dev.txt              # Test/lint tools
├── .env.example                      # Full env template with all variables
├── setup.sh                          # One-command local setup
│
├── src/
│   ├── config.py                     # Paths, models, thresholds + Pinecone + Vertex AI config
│   ├── agent.py                      # Main orchestrator
│   ├── query_analyzer.py             # 5-dimension analyzer
│   ├── pattern_router.py             # Routes queries to patterns
│   ├── security.py                   # Prompt injection + PII detection/redaction
│   ├── observability.py              # Prometheus metrics + structlog
│   │
│   ├── patterns/                     # 14 RAG pattern implementations
│   │   ├── naive_rag.py, hyde.py, query_rewriting.py, crag.py, self_rag.py
│   │   ├── rag_fusion.py, conv_rag.py, agentic_rag.py, flare.py
│   │   └── speculative_rag.py, graph_rag.py, multimodal_rag.py
│   │
│   ├── retrieval/
│   │   ├── vector_store.py           # Pinecone (replaces ChromaDB) — namespace per tenant
│   │   ├── media_ingest.py           # Audio/video/web/YouTube ingestion
│   │   ├── web_search.py             # Tavily fallback search
│   │   └── reranker.py               # Cohere + RRF reranking
│   │
│   ├── generation/
│   │   └── llm.py                    # Groq / Vertex AI Claude switching via LLM_PROVIDER
│   │
│   └── memory/
│       └── sqlite_store.py           # 4-layer local memory store
│
├── api/
│   ├── main.py                       # FastAPI app — middleware + routers
│   ├── auth_utils.py                 # JWT + API Key auth
│   ├── middleware/
│   │   ├── rate_limit.py             # Redis-backed sliding window (Memorystore in prod)
│   │   └── audit.py                  # Structured audit logging
│   └── routers/
│       ├── auth.py, query.py, ingest.py, health.py, admin.py
│
├── infra/
│   ├── gcp/
│   │   ├── cloudrun-api.yaml         # Cloud Run service spec — API (1–100 containers)
│   │   └── cloudrun-frontend.yaml    # Cloud Run service spec — Frontend
│   ├── k8s/
│   │   └── deployment.yml            # K8s manifests — no in-cluster DB/Redis/ChromaDB pods
│   └── postgres/
│       └── init.sql                  # 10-table multi-tenant schema
│
├── scripts/
│   ├── deploy_gcp.sh                 # One-command GCP provisioning (9 steps)
│   ├── preflight_check.sh            # Pre-deploy validation (runs in <5s)
│   ├── build_and_test.sh             # Local build pipeline: lint→test→build→smoke test
│   └── create_pinecone_index.py      # Auto-creates Pinecone index (dim=384, cosine)
│
└── tests/
    ├── conftest.py                   # Fixtures: mocks Pinecone, Redis, LLM (no network calls)
    ├── test_api.py                   # Health, auth, protected routes (14 tests)
    ├── test_vector_store.py          # Pinecone ingest/retrieve/namespace (13 tests)
    ├── test_rate_limit.py            # Redis rate limiter, 429, fail-open (8 tests)
    ├── test_llm.py                   # Groq/Vertex AI switching, grade, retry (11 tests)
    ├── test_query_analyzer.py        # 5-dimension routing, pattern selection (15 tests)
    └── test_security.py              # Injection, PII, sanitization, upload validation (20 tests)
```

---

## Quick Start — Local Development

### Prerequisites

- Python 3.12+
- Docker Desktop running
- [Groq API Key](https://console.groq.com/) — free
- [Pinecone API Key](https://www.pinecone.io/) — free Starter plan
- ffmpeg for video ingestion: `winget install ffmpeg` (Windows) / `brew install ffmpeg` (Mac)

### 1. Clone and Setup

```bash
git clone https://github.com/mshan011181/universal-rag-agent-enterprise.git
cd universal-rag-agent-enterprise
bash setup.sh
```

`setup.sh` creates the venv, installs dependencies, copies `.env.example` to `.env`, and auto-creates the Pinecone index.

### 2. Configure Environment

Edit `.env`:

```env
# Required
GROQ_API_KEY=your_groq_key_here
PINECONE_API_KEY=your_pinecone_key_here

# Optional — enables web search fallback and cross-encoder reranking
TAVILY_API_KEY=your_tavily_key_here
COHERE_API_KEY=your_cohere_key_here

# Local dev — LLM_PROVIDER=groq uses Groq; set to vertexai for Vertex AI Claude
LLM_PROVIDER=groq
```

### 3. Run Locally

**Streamlit UI:**
```bash
streamlit run app.py
```
Open [http://localhost:8501](http://localhost:8501)

**Full Docker stack** (includes local postgres + redis for dev):
```bash
docker-compose up -d --build
```

| Service | URL |
|---------|-----|
| Streamlit UI | http://localhost:8501 |
| FastAPI Swagger | http://localhost:8000/api/docs |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin/admin) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key — LLM and Whisper transcription |
| `PINECONE_API_KEY` | Yes | Pinecone API key — vector database |
| `PINECONE_INDEX_NAME` | No | Index name (default: `universal-rag`) |
| `LLM_PROVIDER` | No | `groq` (default) or `vertexai` |
| `VERTEXAI_PROJECT` | Prod | GCP project ID (set automatically on Cloud Run) |
| `VERTEXAI_LOCATION` | No | Vertex AI region (default: `us-east5`) |
| `VERTEXAI_MODEL` | No | Model ID (default: `claude-sonnet-4-5@20251205`) |
| `TAVILY_API_KEY` | Optional | Web search fallback (CRAG pattern) |
| `COHERE_API_KEY` | Optional | Cross-encoder reranking |
| `JWT_SECRET` | Production | JWT token signing secret |
| `DATABASE_URL` | Production | Cloud SQL connection string (auto-set by deploy script) |
| `REDIS_URL` | Production | Memorystore connection string (auto-set by deploy script) |
| `ENVIRONMENT` | Production | Set to `production` |

Generate `JWT_SECRET`:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Pinecone Index Setup

The Pinecone index is created automatically — you never need to do this manually.

**Via setup.sh** (runs during initial setup):
```bash
bash setup.sh
```

**Standalone** (if you skipped setup.sh):
```bash
python scripts/create_pinecone_index.py
```

**Automatic on first app start** — if the index doesn't exist when the app first calls `retrieve()` or `ingest_*()`, `vector_store.py` creates it automatically before proceeding.

Index spec: `dimension=384, metric=cosine` — matches `all-MiniLM-L6-v2` output.

---

## Architecture

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
  ┌────────▼────────┐    ┌────────────┐    ┌──────────────────────┐
  │   Retrieval     │───▶│  Reranker  │───▶│     Generation       │
  │ (Pinecone +     │    │ (RRF /     │    │  Groq or Vertex AI   │
  │  Web Search)    │    │  Cohere)   │    │  Claude — 4 roles    │
  └─────────────────┘    └────────────┘    └──────────┬───────────┘
                                                      │
                                             ┌────────▼────────┐
                                             │     Memory      │
                                             │   (4 layers)    │
                                             └─────────────────┘
```

### 4 LLM Roles

| Role | Responsibility |
|------|----------------|
| **Synthesizer** | Generates the final answer from retrieved chunks |
| **Grader** | Scores answer quality (0.0–1.0) across relevance, completeness, hallucination risk |
| **Verifier** | Checks faithfulness — every sentence must be supported by a source chunk |
| **Judge** | Resolves conflicting information across sources |

### 4 Memory Layers

| Layer | Purpose |
|-------|---------|
| **Conversation History** | Tracks dialogue context per session |
| **Pattern Performance** | Learns which patterns work best per query type |
| **Routing Signals** | Improves future routing decisions |
| **Verified Knowledge Cache** | Stores high-confidence answers (score ≥ 0.85) for instant reuse |

---

## Production Deployment — GCP Managed Services

### Prerequisites

- `gcloud` CLI installed and authenticated
- Docker Desktop running
- GCP project with billing enabled
- Vertex AI Claude enabled: `console.cloud.google.com/vertex-ai/model-garden` → search Claude → Enable

### Step 1 — Pre-flight Check

```bash
export PROJECT_ID=your-gcp-project-id
bash scripts/preflight_check.sh
```

Checks tools, credentials, env vars, and API keys. Completes in under 5 seconds.

### Step 2 — Deploy Everything

```bash
bash scripts/deploy_gcp.sh
```

The script runs 9 steps end-to-end (~15 minutes total):

| Step | What It Provisions | Time |
|------|--------------------|------|
| 1 | Enable 9 GCP APIs | ~1 min |
| 2 | Artifact Registry repo | ~30s |
| 3 | Cloud SQL PostgreSQL (db-g1-small, auto-grow, daily backup) | ~5 min |
| 4 | Serverless VPC Access connector (required for Memorystore) | ~2 min |
| 5 | Memorystore Redis 7 (5GB, VPC-internal) | ~2 min |
| 6 | Pinecone index (idempotent — skips if exists) | ~30s |
| 7 | Service account + 4 IAM roles | ~30s |
| 8 | All secrets in Secret Manager | ~30s |
| 9 | Docker build + push + Cloud Run deploy (API + Frontend) | ~5 min |

At the end, the script prints your live URLs:
```
  API      : https://rag-api-xxxx-uc.a.run.app
  Frontend : https://rag-frontend-xxxx-uc.a.run.app
```

### Step 3 — Run the DB Schema

```bash
gcloud sql connect rag-postgres --user=raguser --database=ragdb --project=your-project-id
# Then at the psql prompt:
\i infra/postgres/init.sql
```

### What Managed Services Replace

| BEFORE (single container) | AFTER (managed) | Benefit |
|---|---|---|
| ChromaDB container | **Pinecone** | Unlimited vectors, per-tenant namespaces, consistent <100ms |
| PostgreSQL container | **Cloud SQL** | 4000 connections, auto-failover, 64TB, daily backups |
| Redis container | **Memorystore** | 300GB, persistent, cluster-sharded, no eviction surprises |
| Groq Llama (hardcoded) | **Vertex AI Claude** | No rate limits, Google manages infrastructure |
| FastAPI VM container | **Cloud Run** | 1→100 containers automatically, pay per request |
| Streamlit VM container | **Cloud Run** | Same auto-scaling |

---

## Build and Test Pipeline

### Local Pipeline

```bash
bash scripts/build_and_test.sh
```

7 stages — each must pass before the next runs:

```
Stage 1 → ruff lint
Stage 2 → mypy type check
Stage 3 → bandit security scan (SAST)
Stage 4 → pytest  ← 70% coverage gate — images only built if this passes
Stage 5 → docker build API image
Stage 6 → docker build Frontend image
Stage 7 → smoke test (start container → curl /api/health → stop)
```

Skip lint for a faster build cycle:
```bash
bash scripts/build_and_test.sh --skip-lint
```

### Cloud Build Pipeline (CI/CD)

Triggered automatically on every `git push`. Defined in `cloudbuild.yaml`:

```
Steps 1–4  → install deps, lint, typecheck, security (parallel)
Step  5    → pytest with 70% coverage gate        ← GATE: images only built if green
Steps 6–7  → docker build API + Frontend          ← waitFor: [test]
Steps 8–9  → push to Artifact Registry
Steps 10–11→ deploy to Cloud Run
Step  12   → upload coverage.xml to GCS
```

**If any test fails, the pipeline exits at step 5 — no Docker images are produced.**

### Running Tests

```bash
pip install -r requirements-dev.txt -r requirements-api.txt
pytest
```

All external services (Pinecone, Redis, LLM) are mocked in `tests/conftest.py` — tests run with zero network calls and no credentials.

### Test Coverage

| File | What It Tests | Tests |
|------|--------------|-------|
| `test_api.py` | Health, auth register/login/refresh, protected routes | 14 |
| `test_vector_store.py` | Pinecone ingest/retrieve, namespace isolation, error handling | 13 |
| `test_rate_limit.py` | Redis rate limiter, 429 response, fail-open, expire called | 8 |
| `test_llm.py` | Groq/Vertex AI switching, grade, faithfulness, retry | 11 |
| `test_query_analyzer.py` | All 5 dimensions, pattern selection, deduplication, bad JSON | 15 |
| `test_security.py` | Injection detection, PII redaction, sanitization, upload validation | 20 |
| **Total** | | **81** |

Coverage gate: **70% minimum** enforced in both local pipeline and Cloud Build.

---

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | None | Register new user |
| `/api/auth/token` | POST | None | Get JWT access + refresh token |
| `/api/auth/refresh` | POST | JWT | Refresh access token |
| `/api/query/` | POST | JWT or API Key | Submit a RAG query |
| `/api/ingest/file` | POST | JWT or API Key | Upload and index a file |
| `/api/ingest/text` | POST | JWT or API Key | Index raw text |
| `/api/health` | GET | None | Liveness probe |
| `/api/health/ready` | GET | None | Readiness probe (checks Pinecone) |
| `/api/admin/stats` | GET | Admin JWT | System statistics |
| `/metrics` | GET | None | Prometheus metrics |

### Rate Limits (Redis / Memorystore backed)

| Endpoint | Limit |
|----------|-------|
| `/api/query` | 30 req/min |
| `/api/ingest` | 10 req/min |
| `/api/auth` | 20 req/min |
| Default | 100 req/min |

Rate limit state is stored in Redis/Memorystore — consistent across all Cloud Run instances. If Redis is unavailable, the middleware fails open (requests pass through) rather than blocking all traffic.

---

## Kubernetes Deployment

The K8s manifest (`infra/k8s/deployment.yml`) has been updated to reflect the managed services migration — **ChromaDB, PostgreSQL, and Redis pods have been removed**. Only the application pods remain; all stateful services are external managed services.

```bash
# Create secrets from GCP Secret Manager values
kubectl create secret generic rag-secrets \
  --from-literal=groq-api-key=<key> \
  --from-literal=jwt-secret=<secret> \
  --from-literal=pinecone-api-key=<key> \
  --from-literal=database-url=<cloud-sql-url> \
  --from-literal=redis-url=<memorystore-url> \
  --from-literal=vertexai-project=<project-id>

# Apply manifests
kubectl apply -f infra/k8s/deployment.yml
```

HPA scales both API and Frontend deployments from **2 to 100 pods** on CPU (>70%) or memory (>80%).

---

## Observability

Prometheus scrapes `/metrics` every 15 seconds.

| Metric | What It Tracks |
|--------|----------------|
| `rag_queries_total` | Total queries by pattern and status |
| `rag_query_latency_seconds` | Query duration histogram |
| `rag_quality_score` | Answer quality distribution (0.0–1.0) |
| `rag_fallback_total` | Web search fallback frequency |
| `rag_cache_hits_total` | Verified knowledge cache hit rate |
| `http_requests_total` | All API requests by endpoint and status |
| `http_request_duration_seconds` | API response time histogram |

---

## Repositories

| Repo | Description |
|------|-------------|
| [universal-rag-agent-enterprise](https://github.com/mshan011181/universal-rag-agent-enterprise) | This repo — managed services, Cloud Run, Pinecone |
| [universal-rag-agent](https://github.com/mshan011181/universal-rag-agent) | Original single-VM version with Docker containers |

---

## License

Copyright (c) 2025 Shan. All rights reserved.

Viewing and downloading this code is permitted for reference and educational purposes only. Modification, redistribution, commercial use, and derivative works are strictly prohibited without prior written permission from the author.

---

## Author

**Shan** — AI Engineer

Built with Groq, LangChain, Pinecone, Vertex AI Claude, and Google Cloud Run.

GitHub: [https://github.com/mshan011181/universal-rag-agent-enterprise](https://github.com/mshan011181/universal-rag-agent-enterprise)
