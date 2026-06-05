# Universal RAG Agent Enterprise

> Production-grade Retrieval-Augmented Generation system implementing **14 RAG patterns** in a single intelligent agent — auto-scales from 1 to 100 containers on **Google Cloud Run** or **GKE Autopilot**, backed by **Pinecone**, **Cloud SQL**, **Memorystore**, **Anthropic Claude**, and monitored end-to-end via **LangSmith**.

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![Cloud Run](https://img.shields.io/badge/Cloud%20Run-Auto--scaling-4285F4?logo=googlecloud)](https://cloud.google.com/run)
[![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-green)](https://www.pinecone.io/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude%20Sonnet-blueviolet)](https://www.anthropic.com/)
[![LangSmith](https://img.shields.io/badge/LangSmith-Observability-orange)](https://smith.langchain.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)

---

## Overview

The Universal RAG Agent automatically selects the optimal retrieval strategy for every query using a **5-dimension query analyzer**. Rather than being locked into a single RAG approach, it routes each query through the best-fit pattern — or chains multiple patterns — based on query length, ambiguity, complexity, data type, and conversation state.

---

## Before vs After — Full Infrastructure Migration

```
BEFORE (Single VM — breaks at scale)          AFTER (Managed Services — scales automatically)

All Enterprise Tenants                        All Enterprise Tenants
         │                                              │
         ▼                                              ▼
      GCP VM                                   Cloud Load Balancer
      ├── FastAPI container   ~50 concurrent            │
      ├── Streamlit container ~20 concurrent            ▼
      ├── ChromaDB container  slows/crashes    Cloud Run (FastAPI)     1 → 100 containers
      ├── PostgreSQL container hits conn limit  Cloud Run (Next.js UI)  1 → 100 containers
      └── Redis container     runs OOM                  │         ─ or ─
                                               GKE Autopilot           2 → 100 pods
      LLM: Groq (hardcoded)                            │
      No monitoring                            ├── Pinecone            unlimited vectors
                                               ├── Cloud SQL           4000 conns, 64TB
                                               ├── Memorystore         300GB, sharded
                                               ├── Anthropic Claude    enterprise SLA
                                               └── LangSmith           full trace/monitoring
```

---

## Key Features

- **14 RAG Patterns** — all implemented and auto-selected per query
- **5-Dimension Query Analyzer** — routes each query to the right pattern(s)
- **Multi-modal Ingestion** — PDF, DOCX, TXT, Audio, Video, Web Pages, YouTube
- **Groq Whisper** — audio/video transcription (whisper-large-v3)
- **Self-Improving Memory** — tracks pattern performance, routing signals, verified knowledge
- **3 LLM Providers** — `anthropic` (production default), `vertexai` (GCP-native), `groq` (local dev/CI)
- **LangSmith Monitoring** — every LLM call traced with token counts, latency, cost, and quality scores
- **Production API** — FastAPI with JWT + OAuth2 + API Key auth, Redis-backed rate limiting, audit log
- **Production UI** — Next.js 14 (replaces Streamlit) — login, query, ingest, admin dashboard, role-based nav
- **Observability** — Prometheus metrics, Grafana dashboards, structured logging, LangSmith traces
- **Two Deployment Targets** — Cloud Run (serverless) or GKE Autopilot (K8s), same images
- **Cloud Build CI/CD** — lint → typecheck → security → tests → build → push to Artifact Registry → deploy

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

## Full Architecture

```
                         ┌─────────────────────────────────────────────────────┐
                         │              Enterprise Tenants                      │
                         │   (per-tenant Pinecone namespace + DB schema)        │
                         └─────────────────────┬───────────────────────────────┘
                                               │
                                               ▼
                               ┌───────────────────────────┐
                               │     Cloud Load Balancer    │
                               └──────────┬────────────────┘
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    ▼                                             ▼
       ┌────────────────────────┐               ┌────────────────────────────┐
       │  Cloud Run / GKE       │               │  Cloud Run / GKE           │
       │  FastAPI (rag-api)     │               │  Next.js 14 (rag-frontend) │
       │  1–100 containers      │               │  1–100 containers          │
       └────────────┬───────────┘               └────────────────────────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │     Query Analyzer     │  5 dimensions:
       │     (5-dimension)      │  length · ambiguity · complexity
       └────────────┬───────────┘  data_type · conversation_state
                    │
                    ▼
       ┌────────────────────────┐
       │     Pattern Router     │  Sequential chain or parallel fan-out
       └────────────┬───────────┘  across 14 RAG patterns
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
   ┌──────────┐ ┌────────┐ ┌──────────────────────────────────────┐
   │Retrieval │ │Reranker│ │          Generation Layer             │
   │          │ │        │ │                                       │
   │Pinecone  │ │Cohere  │ │  ┌────────────┬─────────────────────┐│
   │namespaced│ │cross-  │ │  │ LLM_PROVIDER switching           ││
   │vector DB │ │encoder │ │  │                                   ││
   │+         │ │+       │ │  │ anthropic  → Anthropic Claude API ││  ← Production default
   │Tavily    │ │RRF     │ │  │ vertexai   → Vertex AI via ADC   ││  ← GCP-native option
   │web search│ │reranking│ │  │ groq       → Groq Llama          ││  ← Local dev / CI
   └──────────┘ └────────┘ │  └────────────┴─────────────────────┘│
                            │                                       │
                            │  4 LLM Roles per query:               │
                            │  Synthesizer · Grader                 │
                            │  Verifier   · Judge                   │
                            └───────────────────┬───────────────────┘
                                                │
                                                ▼
                            ┌───────────────────────────────────────┐
                            │         LangSmith Tracing             │
                            │  Every chain call captured:           │
                            │  token counts · latency · cost        │
                            │  quality scores · full prompt traces  │
                            └───────────────────┬───────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
       ┌────────────────────┐   ┌───────────────────────┐   ┌──────────────────────┐
       │   Pinecone         │   │   Cloud SQL            │   │   Memorystore Redis  │
       │   Vector DB        │   │   PostgreSQL           │   │   Rate limiting +    │
       │   namespace per    │   │   10-table multi-      │   │   session cache      │
       │   tenant           │   │   tenant schema        │   │   VPC-internal       │
       └────────────────────┘   └───────────────────────┘   └──────────────────────┘

       ┌────────────────────────────────────────────────────────────────────────────┐
       │                         4-Layer Memory Store                               │
       │  Conversation History · Pattern Performance · Routing Signals              │
       │  Verified Knowledge Cache (score ≥ 0.85 → instant reuse)                  │
       └────────────────────────────────────────────────────────────────────────────┘

       ┌────────────────────────────────────────────────────────────────────────────┐
       │              GCP Infrastructure (Secret Manager + IAM)                     │
       │  All API keys stored as secrets · Cloud Run + GKE pull via service account │
       │  Workload Identity for GKE — no key files on pods                          │
       └────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

> **Important distinction** — the table has three columns: what the application **is**, and **where** it runs.
> FastAPI and Next.js are the **applications**. Cloud Run is the **hosting platform** that runs them.
> Cloud Run does not replace FastAPI or Next.js — it replaces the single VM they previously ran on.
>
> ```
> WHAT runs       WHERE it runs (local)     WHERE it runs (production)
> ─────────────────────────────────────────────────────────────────────
> FastAPI     →   uvicorn on localhost   →  Cloud Run container (1→100)
> Next.js     →   node dev server        →  Cloud Run container (1→100)
> ```

| Layer | Application / Technology | Local Dev | Production Hosting |
|-------|--------------------------|-----------|-------------------|
| **API** | **FastAPI** (Python) — never replaced | uvicorn on `localhost:8000` | **Cloud Run** — serverless, 1→100 containers, auto-scale |
| **UI** | **Next.js 14 + React** — replaces Streamlit | Node dev server on `localhost:3000` | **Cloud Run** — serverless, 1→100 containers, auto-scale |
| **LLM (default)** | **Anthropic Claude Sonnet** | `LLM_PROVIDER=groq` (Groq Llama) | `LLM_PROVIDER=anthropic` → Anthropic API |
| **LLM (GCP-native alt)** | **Vertex AI Claude** via ADC | — | `LLM_PROVIDER=vertexai` → no API key needed |
| **LLM Monitoring** | **LangSmith** | Optional | Required — traces all 3 providers automatically |
| **Vector DB** | **Pinecone** | Pinecone (same) | Pinecone — unlimited vectors, per-tenant namespaces |
| **Relational DB** | **PostgreSQL** | Local container | **Cloud SQL** — 4000 conns, auto-failover, 64TB |
| **Cache / Rate limit** | **Redis** | Local container | **Memorystore** — 300GB, persistent, VPC-internal |
| **Container Registry** | Docker images | Local only | **Artifact Registry** (GCP-private, not Docker Hub) |
| **Embeddings** | sentence-transformers all-MiniLM-L6-v2 | Local (no API key) | Same — runs inside FastAPI container |
| **Transcription** | Groq Whisper large-v3 | Same | Same |
| **Orchestration** | LangChain 0.3.x + LangGraph | Same | Same |
| **Auth** | JWT (python-jose) + bcrypt | Same | Same — secrets stored in Secret Manager |
| **Observability** | Prometheus + Grafana + structlog | Same | Same + Cloud Logging + **LangSmith** |
| **Reranking** | Cohere cross-encoder + RRF | Same | Same |
| **CI/CD** | — | `scripts/build_and_test.sh` | Cloud Build → Artifact Registry → Cloud Run |

**Production component map — technology vs hosting platform:**

| Component | Technology (the app) | Hosted On (the platform) |
|-----------|----------------------|--------------------------|
| API | FastAPI (Python) | Cloud Run |
| UI | Next.js 14 (React) | Cloud Run |
| Vector DB | Pinecone | Pinecone managed cloud |
| Relational DB | PostgreSQL | Cloud SQL (GCP managed) |
| Cache | Redis | Memorystore (GCP managed) |
| LLM | Anthropic Claude Sonnet | Anthropic API |
| Secrets | — | Secret Manager (GCP) |
| Images | Docker | Artifact Registry (GCP) |

---

## LLM Provider Switching

All three providers use the same `get_llm()` factory in `src/generation/llm.py`. Switch by setting one env var:

| `LLM_PROVIDER` | Provider | Auth | Recommended For |
|---|---|---|---|
| `anthropic` | Anthropic Claude Sonnet direct API | `ANTHROPIC_API_KEY` | **Production enterprise (default)** |
| `vertexai` | Vertex AI Claude via ADC | GCP service account (no key) | GCP-native, no external API calls |
| `groq` | Groq Llama 3.3-70b | `GROQ_API_KEY` | Local dev / CI pipelines |

No code changes required to switch providers — only the env var changes.

### Why Anthropic over Groq for production

| | Groq | Anthropic |
|---|---|---|
| SLA | None (free tier) | 99.9% uptime guarantee |
| Rate limits | Strict (tokens/min cap) | High (enterprise tier) |
| Model quality | Llama 3.3-70b | Claude Sonnet — better reasoning |
| Support | Community | Dedicated enterprise support |
| Cost predictability | Variable | Consistent pricing |

---

## LangSmith Monitoring

LangSmith traces every LLM call across all three providers automatically. No additional instrumentation needed in chain files — `_configure_langsmith()` sets the required env vars at startup and LangChain picks them up.

### What gets traced

| Call | Captured |
|------|---------|
| `synthesize()` | Full prompt, response, token count, latency |
| `grade()` | Quality scores per dimension (relevance, completeness, hallucination risk) |
| `check_faithfulness()` | Citation map, unsupported sentences flagged |
| `generate_followups()` | Follow-up questions with confidence |
| Every retrieval chain | Chunks retrieved, reranker scores, pattern used |

### LangSmith dashboard gives you

- **Per-tenant traces** — filter by enterprise, user, or session
- **Cost per query** — token count × model rate, aggregated by day/week
- **Latency percentiles** — p50 / p95 / p99 per RAG pattern
- **Quality score trends** — track hallucination risk over time
- **Failure analysis** — full prompt replay for any failed query

### Setup

```bash
# 1. Sign up at smith.langchain.com (free tier available)
# 2. Create a project named "universal-rag-enterprise"
# 3. Copy your API key, then:

export LANGSMITH_API_KEY=ls__your_key_here

# Tracing is then enabled automatically when deploy_gcp.sh runs
```

---

## Project Structure

```
universal-rag-agent-enterprise/
├── Dockerfile                        # FastAPI API image (Cloud Run PORT env var aware)
├── Dockerfile.nextjs                 # Next.js UI image — multi-stage, ~150MB standalone
├── Dockerfile.streamlit              # Streamlit image — local data exploration only
├── docker-compose.yml                # Local dev: API + Next.js UI + postgres + redis
├── cloudbuild.yaml                   # Cloud Build CI/CD — 12 stages, images gated on tests
├── pytest.ini                        # Test config — 70% coverage gate, asyncio auto
├── requirements.txt                  # Core shared deps
├── requirements-api.txt              # API container: langchain-anthropic, langsmith, pinecone
├── requirements-dev.txt              # Test/lint tools: pytest, ruff, mypy, bandit
├── .env.example                      # Full env template
├── setup.sh                          # One-command local setup
│
├── frontend/                         # ── Next.js 14 Production UI ──────────────────
│   ├── package.json                  # Next 14, React 18, Tailwind, TypeScript
│   ├── next.config.js                # standalone output + /api/* dev proxy to FastAPI
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── types/index.ts            # Shared TypeScript types (QueryResponse, AuthTokens…)
│       ├── lib/
│       │   ├── api.ts                # Fetch wrapper — auto-refresh on 401, all endpoints
│       │   └── auth.ts               # restoreSession, getUserRole, clearSession
│       ├── app/
│       │   ├── layout.tsx            # Root layout + global CSS
│       │   ├── page.tsx              # Root → redirect to /query
│       │   ├── login/page.tsx        # Sign in → POST /api/auth/token
│       │   ├── register/page.tsx     # Create account → POST /api/auth/register
│       │   ├── query/page.tsx        # RAG query — pattern picker, quality badge, sources
│       │   ├── ingest/page.tsx       # Drag-drop file upload + paste text, per-tenant namespace
│       │   └── admin/page.tsx        # KPI cards + RAG pattern usage bar chart (admin only)
│       └── components/
│           ├── AuthGuard.tsx         # Redirects to /login if session invalid
│           └── layout/
│               ├── Sidebar.tsx       # Dark sidebar — role-based nav (admin link hidden for users)
│               └── AppShell.tsx      # AuthGuard + Sidebar wrapper for all authenticated pages
│
├── src/                              # ── Python backend (shared by FastAPI) ─────────
│   ├── config.py                     # All config: Pinecone, Anthropic, Vertex AI, LangSmith
│   ├── agent.py                      # Main RAG orchestrator
│   ├── query_analyzer.py             # 5-dimension query analyzer
│   ├── pattern_router.py             # Routes queries to optimal RAG pattern(s)
│   ├── security.py                   # Prompt injection + PII detection/redaction
│   ├── observability.py              # Prometheus metrics + structlog
│   │
│   ├── patterns/                     # 14 RAG pattern implementations
│   │   ├── naive_rag.py, hyde.py, query_rewriting.py, crag.py, self_rag.py
│   │   ├── rag_fusion.py, conv_rag.py, agentic_rag.py, flare.py
│   │   └── speculative_rag.py, graph_rag.py, multimodal_rag.py
│   │
│   ├── retrieval/
│   │   ├── vector_store.py           # Pinecone — namespace per tenant, auto-creates index
│   │   ├── media_ingest.py           # Audio/video/web/YouTube ingestion
│   │   ├── web_search.py             # Tavily fallback search
│   │   └── reranker.py               # Cohere + RRF reranking
│   │
│   ├── generation/
│   │   └── llm.py                    # 3-provider factory (anthropic/vertexai/groq) + LangSmith
│   │
│   └── memory/
│       └── sqlite_store.py           # 4-layer local memory store
│
├── api/                              # ── FastAPI backend ────────────────────────────
│   ├── main.py                       # App entry — CORS, middleware, routers
│   ├── auth_utils.py                 # JWT + API Key auth
│   ├── middleware/
│   │   ├── rate_limit.py             # Redis-backed sliding window (Memorystore in prod)
│   │   └── audit.py                  # Structured audit logging
│   └── routers/
│       └── auth.py, query.py, ingest.py, health.py, admin.py
│
├── infra/
│   ├── gcp/
│   │   ├── cloudrun-api.yaml         # Cloud Run service spec — FastAPI
│   │   └── cloudrun-frontend.yaml    # Cloud Run service spec — Next.js
│   ├── k8s/
│   │   └── deployment.yml            # GKE — Anthropic + LangSmith env, HPAs (2–100 pods)
│   └── postgres/
│       └── init.sql                  # 10-table multi-tenant schema
│
├── scripts/
│   ├── deploy_gcp.sh                 # 9-step GCP provisioning → Cloud Run (FastAPI + Next.js)
│   ├── setup_gke.sh                  # 8-step GKE Autopilot deploy (same images)
│   ├── preflight_check.sh            # Pre-deploy validation — completes in <5 seconds
│   ├── build_and_test.sh             # Local pipeline: lint → test → docker build → smoke test
│   └── create_pinecone_index.py      # Idempotent Pinecone index creation (dim=384, cosine)
│
└── tests/
    ├── conftest.py                   # Autouse mocks: Pinecone, Redis, LLM (zero network calls)
    ├── test_api.py                   # Health, auth register/login/refresh, protected routes (14)
    ├── test_vector_store.py          # Pinecone ingest/retrieve, namespace isolation (13)
    ├── test_rate_limit.py            # Redis rate limiter, 429, fail-open, expire (8)
    ├── test_llm.py                   # All 3 provider switching, grade, faithfulness, retry (11)
    ├── test_query_analyzer.py        # 5 dimensions, pattern selection, deduplication (15)
    └── test_security.py              # Injection, PII, sanitization, upload validation (20)
```

---

## Quick Start — Local Development

### Prerequisites

- Python 3.12+
- Docker Desktop running
- [Groq API Key](https://console.groq.com/) — free (local dev)
- [Pinecone API Key](https://www.pinecone.io/) — free Starter plan
- [Anthropic API Key](https://console.anthropic.com/) — for production
- [LangSmith API Key](https://smith.langchain.com/) — free tier available
- ffmpeg: `winget install ffmpeg` (Windows) / `brew install ffmpeg` (Mac)

### 1. Clone and Setup

```bash
git clone https://github.com/mshan011181/universal-rag-agent-enterprise.git
cd universal-rag-agent-enterprise
bash setup.sh
```

### 2. Configure Environment

Edit `.env`:

```env
# LLM — use groq for local dev, anthropic for production
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here

# Vector DB
PINECONE_API_KEY=your_pinecone_key_here
PINECONE_INDEX_NAME=universal-rag

# Production LLM (set LLM_PROVIDER=anthropic to use)
ANTHROPIC_API_KEY=your_anthropic_key_here
ANTHROPIC_MODEL=claude-sonnet-4-5

# LangSmith monitoring (optional locally, required in production)
LANGSMITH_API_KEY=your_langsmith_key_here
LANGSMITH_PROJECT=universal-rag-enterprise

# Optional
TAVILY_API_KEY=your_tavily_key_here
COHERE_API_KEY=your_cohere_key_here
```

### 3. Run Locally

There are two ways to run the app locally. They serve **different purposes** in your development workflow — use Step 1 first, Step 2 only when you are ready to verify the Docker build.

---

#### Step 1 — Dev servers (while actively writing code)

Use this during development. Both servers have **hot-reload** — any code change is reflected instantly without restarting.

**Terminal 1 — FastAPI backend:**
```bash
uvicorn api.main:app --reload --port 8000
```

**Terminal 2 — Next.js frontend:**
```bash
cd frontend
npm install          # first time only
npm run dev          # starts on http://localhost:3000
```

The Next.js dev server automatically proxies all `/api/*` calls to `http://localhost:8000` — no CORS configuration needed. Both services see your code changes live as you type.

| Service | URL | Hot-reload |
|---------|-----|-----------|
| Next.js UI | http://localhost:3000 | Yes — instant on save |
| FastAPI Swagger | http://localhost:8000/api/docs | Yes — on save |

Use this step for the **majority of your development time** — it is the fastest feedback loop.

---

#### Step 2 — Docker Compose (before pushing — verify the Docker build works)

Once your feature is working in Step 1, run Docker Compose to verify that the app **behaves the same way inside a Docker container** as it did in the dev server. This is important because the Docker image is what actually gets deployed to Cloud Run — differences between the dev server and the container can cause production bugs.

```bash
docker-compose up -d --build
```

`--build` rebuilds the Docker images from scratch every time, so you are always testing the latest code.

| Service | URL | Notes |
|---------|-----|-------|
| Next.js UI | http://localhost:3000 | Running inside Docker container |
| FastAPI Swagger | http://localhost:8000/api/docs | Running inside Docker container |
| Prometheus | http://localhost:9090 | Metrics scraping |
| Grafana | http://localhost:3001 | Login: admin / admin |

Things Docker Compose catches that the dev server does not:
- Missing dependencies not listed in `requirements-api.txt` or `package.json`
- Environment variable configuration errors
- File permission issues inside the container
- Port binding conflicts

To stop:
```bash
docker-compose down
```

---

#### Typical local development workflow

The rule is simple: **tests always come before any Docker build.** You never build an image before tests pass.

```
1. Write code
      │
      ▼
2. Test with dev servers             ← use this most of the time during development
   uvicorn + npm run dev
   Hot-reload on every save — no Docker involved, fastest feedback
      │
      ▼
3. Run the full quality gate         ← tests run FIRST, API image built AFTER tests pass
   bash scripts/build_and_test.sh
   │
   ├── Stage 1: ruff lint
   ├── Stage 2: mypy type check
   ├── Stage 3: bandit security scan
   ├── Stage 4: pytest (81 tests + 70% coverage gate)    ← GATE
   ├── Stage 5: docker build rag-api:TAG                 ← API image only, local machine
   ├── Stage 6: docker build rag-frontend:TAG            ← Frontend image only, local machine
   └── Stage 7: smoke test API only (curl /api/health)   ← no postgres, no redis, no frontend

   Output: rag-api:TAG and rag-frontend:TAG on YOUR LOCAL MACHINE only.
           NO postgres. NO redis. NOT a full stack test. NOT pushed to Artifact Registry.
      │
      ▼
4. (Optional) Verify full stack with Docker Compose   ← use Step 4's images in Step 5
   docker-compose up --build
   │
   What this adds over Step 3:
   ├── Rebuilds rag-api + rag-frontend images (our code — built from Dockerfile + Dockerfile.nextjs)
   ├── Pulls postgres:16-alpine from Docker Hub  ← official image, no Dockerfile for this
   ├── Pulls redis:7-alpine from Docker Hub      ← official image, no Dockerfile for this
   ├── Starts all 4 together: API + Frontend + postgres + redis
   └── Open http://localhost:3000 — manually test the full system end-to-end
   │
   Note: postgres and redis have NO custom Dockerfile — Docker Compose pulls
         the official images directly. Only API and Frontend are our own images.
   │
   Output: Full stack running locally. API + Frontend images refreshed on your machine.
           Use THESE images (from Step 4) for the manual push in Step 5.
   │
   Skip this step if you only changed backend logic and Step 3 passed.
   Use this step if you changed DB queries, Redis caching, or cross-service behaviour.
      │
      ▼
5. (Optional) Manually push images to Artifact Registry
   Push the FULL STACK images from Step 4 (not Step 3 — Step 3 only verified the API).
   Only needed for a hotfix or manual override WITHOUT going through Cloud Build.

   # Authenticate Docker to Artifact Registry (one-time setup)
   gcloud auth configure-docker us-central1-docker.pkg.dev

   # Tag both images (API + Frontend) with the Artifact Registry path
   docker tag rag-api:latest us-central1-docker.pkg.dev/PROJECT_ID/rag-repo/rag-api:TAG
   docker tag rag-frontend:latest us-central1-docker.pkg.dev/PROJECT_ID/rag-repo/rag-frontend:TAG

   # Push both images to Artifact Registry
   docker push us-central1-docker.pkg.dev/PROJECT_ID/rag-repo/rag-api:TAG
   docker push us-central1-docker.pkg.dev/PROJECT_ID/rag-repo/rag-frontend:TAG

   Skip this step in normal workflow — Step 6 (git push) triggers
   Cloud Build which builds and pushes both images automatically.
      │
      ▼
6. Push to git                       ← normal workflow ends here
   bash scripts/git_manager.sh  (option 2)
   — or —
   git push enterprise main

   Cloud Build triggers automatically:
   tests → build API + Frontend → push both to Artifact Registry → deploy to Cloud Run
```

**Summary — what each step builds and where the images go:**

| Step | What is built | API image | Frontend image | postgres + redis | Pushed to Artifact Registry? |
|------|--------------|-----------|---------------|-----------------|------------------------------|
| 2 — Dev servers | Nothing | Raw code only | Raw code only | No | No |
| 3 — build_and_test.sh | Our API + Frontend images only | ✓ local | ✓ local | No (not needed) | No |
| 4 — Docker Compose | Our API + Frontend rebuilt; postgres + redis pulled from Docker Hub | ✓ local (rebuilt) | ✓ local (rebuilt) | ✓ official images pulled | No |
| 5 — Manual push (optional) | Nothing new — pushes Step 4 images | ✓ Artifact Registry | ✓ Artifact Registry | Not pushed (not our images) | Yes — manually |
| 6 — git push → Cloud Build | Our API + Frontend on GCP | ✓ Artifact Registry | ✓ Artifact Registry | Not pushed (Cloud SQL + Memorystore used instead) | Yes — automatically |

---

## Frontend UI — Next.js 14 (replaces Streamlit)

Streamlit is a data-science prototyping tool — not suitable for production enterprise. It was replaced with **Next.js 14** which calls the FastAPI backend via REST API. They are fully decoupled services.

### Why Next.js over Streamlit

| | Streamlit | Next.js 14 |
|---|---|---|
| Auth UI | Hacked via session_state | Proper login / register pages |
| Routing | No real routing | `/login` `/register` `/query` `/ingest` `/admin` |
| Role-based views | Not possible | Admin-only Dashboard — hidden for regular users |
| SSO / SAML readiness | No | Standard OAuth2 flow plugs in |
| Mobile responsive | No | Yes — Tailwind responsive layout |
| Concurrency | 1 Python process per user | Node.js — 80 concurrent users per instance |
| Docker image size | ~500MB Python | ~150MB standalone Node output |
| Production SLA | Not designed for it | Vercel/Cloud Run production-grade |

### Pages

| Route | What It Does |
|-------|-------------|
| `/login` | Email + password → POST `/api/auth/token` → JWT stored in memory |
| `/register` | Create account → POST `/api/auth/register` |
| `/query` | RAG query with pattern picker (auto or any of 14), namespace selector, quality badge, collapsible sources, click-to-ask follow-up questions |
| `/ingest` | Drag-and-drop file upload (PDF/DOCX/TXT/CSV) or paste text — per-tenant namespace |
| `/admin` | KPI cards (total queries, users, documents, avg quality score) + RAG pattern usage bar chart — **admin role only** |

### Auth Flow

```
User logs in → POST /api/auth/token
             ← access_token (stored in JS memory, not localStorage)
             ← refresh_token (stored in sessionStorage)

Every API call → Authorization: Bearer <access_token>
On 401        → auto-retry with refresh_token → POST /api/auth/refresh
On refresh fail → redirect to /login
```

Access token is never written to localStorage — mitigates XSS token theft.

### Why Next.js and not plain React

Next.js **is** React — every component is a standard React component. The choice is between plain React (Vite) vs Next.js (React framework). Next.js was chosen for three specific production reasons:

| | Plain React (Vite) | Next.js 14 |
|---|---|---|
| Routing | Manual (react-router) | Built-in file-based routing |
| SSR / SSG | You build it | Built-in — pages can be server-rendered |
| API routes | Separate server needed | `/app/api/` routes run server-side |
| Auth middleware | Manual — flash of protected content | `middleware.ts` blocks request before page renders |
| Docker output | Needs nginx or custom Node server | `output: standalone` — single `server.js`, ~150MB image |
| Production deploy | Requires server config | `node server.js` — one command |
| Dev CORS proxy | Manual proxy setup | `rewrites` in `next.config.js` — zero config |

**Reason 1 — `output: standalone` Docker image**
Next.js builds a self-contained `server.js` with only the files it needs — no `node_modules` in the final image. Result: ~150MB production image. A plain Vite React build needs nginx or a separately configured Node server, adding complexity to the Dockerfile.

**Reason 2 — Auth guard without flicker**
Next.js middleware runs before the page is rendered — unauthenticated users are redirected to `/login` before seeing any content. With plain React, the component mounts first, checks auth, then redirects — causing a visible flash of the protected page.

**Reason 3 — Dev proxy to FastAPI**
`next.config.js` rewrites `/api/*` to `http://localhost:8000/api/*` in development — no CORS configuration needed. In production the frontend calls FastAPI directly via `NEXT_PUBLIC_API_URL`.

> When you would use plain React instead: fully client-side SPA with no Cloud Run frontend service, or a team that already has a CDN/nginx serving static files and wants zero framework opinions.

---

## API Keys — What You Need and How to Get Them

The table below shows every API key the system uses, whether it is required for local dev or production, where to get it, and what happens without it.

---

### Quick reference — which keys do you need right now?

| Situation | Keys required |
|-----------|--------------|
| **Local dev (writing code)** | `GROQ_API_KEY` + `PINECONE_API_KEY` |
| **Local dev with monitoring** | Above + `LANGSMITH_API_KEY` |
| **Production deploy** | All 6 — `GROQ_API_KEY` + `PINECONE_API_KEY` + `ANTHROPIC_API_KEY` + `LANGSMITH_API_KEY` + `TAVILY_API_KEY` + `COHERE_API_KEY` |

> `deploy_gcp.sh` always prompts for all 6 keys — none can be skipped during production setup.

---

### 1. Groq API Key — `GROQ_API_KEY`

| | |
|---|---|
| **Used for** | LLM in local dev (`LLM_PROVIDER=groq`) + Whisper audio/video transcription in all environments |
| **Required** | Yes — local dev. Also needed in production for Whisper transcription even when `LLM_PROVIDER=anthropic` |
| **Free tier** | Yes — generous free tier, no credit card needed |
| **Get it** | [console.groq.com](https://console.groq.com) → Sign up → API Keys → Create API Key |
| **Steps** | 1. Go to console.groq.com  2. Sign up with Google or email  3. Click **API Keys** in the left sidebar  4. Click **Create API Key**  5. Copy the key — it starts with `gsk_` |

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
```

---

### 2. Pinecone API Key — `PINECONE_API_KEY`

| | |
|---|---|
| **Used for** | Vector database — stores and retrieves document embeddings for all 14 RAG patterns |
| **Required** | Yes — both local dev and production. The app cannot retrieve any documents without this |
| **Free tier** | Yes — Starter plan: 1 index, 100K vectors, no credit card needed |
| **Get it** | [app.pinecone.io](https://app.pinecone.io) → Sign up → API Keys |
| **Steps** | 1. Go to app.pinecone.io  2. Sign up (Google or email)  3. On the dashboard, click **API Keys** in the left sidebar  4. Copy the **Default** key — it starts with a UUID format |

```env
PINECONE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PINECONE_INDEX_NAME=universal-rag   # leave as default
```

> The Pinecone index (`universal-rag`) is created **automatically** when the app starts or when `scripts/create_pinecone_index.py` runs. You do not need to create it manually in the Pinecone dashboard.

---

### 3. Anthropic API Key — `ANTHROPIC_API_KEY`

| | |
|---|---|
| **Used for** | Production LLM (`LLM_PROVIDER=anthropic`) — Claude Sonnet powers all RAG generation, grading, faithfulness checking |
| **Required** | Yes — production. Not needed for local dev if `LLM_PROVIDER=groq` |
| **Free tier** | No — pay-as-you-go. New accounts get $5 free credit to start |
| **Get it** | [console.anthropic.com](https://console.anthropic.com) → Sign up → API Keys |
| **Steps** | 1. Go to console.anthropic.com  2. Sign up and verify email  3. Go to **Settings → API Keys**  4. Click **Create Key**  5. Copy the key — it starts with `sk-ant-` |

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-5   # leave as default
```

> For Vertex AI Claude (`LLM_PROVIDER=vertexai`) — no API key needed. The Cloud Run service account uses Application Default Credentials (ADC) to authenticate. This only works when deployed on GCP.

---

### 4. LangSmith API Key — `LANGSMITH_API_KEY`

| | |
|---|---|
| **Used for** | LLM monitoring and tracing — captures every prompt, response, token count, latency, and cost for all LLM calls |
| **Required** | Strongly recommended for production. Optional for local dev |
| **Free tier** | Yes — 5,000 traces/month free, no credit card needed |
| **Get it** | [smith.langchain.com](https://smith.langchain.com) → Sign up → Settings → API Keys |
| **Steps** | 1. Go to smith.langchain.com  2. Sign up with Google or email  3. Go to **Settings** (bottom left)  4. Click **API Keys** → **Create API Key**  5. Copy the key — it starts with `ls__` |

```env
LANGSMITH_API_KEY=ls__xxxxxxxxxxxxxxxxxxxx
LANGSMITH_PROJECT=universal-rag-enterprise   # leave as default
```

> After setting the key, tracing is enabled automatically — no code changes needed. All LangChain calls (synthesize, grade, faithfulness check, follow-ups) appear in your LangSmith dashboard at `smith.langchain.com`.

---

### 5. Tavily API Key — `TAVILY_API_KEY`

| | |
|---|---|
| **Used for** | Web search fallback in the **CRAG pattern** — when retrieved documents have low confidence, the system falls back to live web search to supplement the answer |
| **Required** | Optional — if not set, the CRAG pattern skips web search and uses only indexed documents |
| **Free tier** | Yes — 1,000 searches/month free |
| **Get it** | [app.tavily.com](https://app.tavily.com) → Sign up → API Keys |
| **Steps** | 1. Go to app.tavily.com  2. Sign up  3. Your API key is shown on the dashboard home — starts with `tvly-` |

```env
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx
```

---

### 6. Cohere API Key — `COHERE_API_KEY`

| | |
|---|---|
| **Used for** | Cross-encoder reranking — after Pinecone retrieves the top-K chunks, Cohere re-scores them for relevance and reorders before sending to the LLM. Improves answer quality |
| **Required** | Optional — if not set, the system uses RRF (Reciprocal Rank Fusion) reranking instead, which is built-in and requires no API key |
| **Free tier** | Yes — Trial API key with generous limits, no credit card needed |
| **Get it** | [dashboard.cohere.com](https://dashboard.cohere.com) → Sign up → API Keys |
| **Steps** | 1. Go to dashboard.cohere.com  2. Sign up  3. Go to **API Keys** in the left sidebar  4. Copy the **Trial key** |

```env
COHERE_API_KEY=xxxxxxxxxxxxxxxxxxxx
```

---

### Auto-generated keys (no signup needed)

These are generated automatically by `deploy_gcp.sh` and stored in Secret Manager. You never need to create or manage them manually.

| Key | How it's generated |
|-----|--------------------|
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` — 64 char hex |
| `DATABASE_URL` | Built from Cloud SQL instance details after Step 3 of deploy |
| `REDIS_URL` | Built from Memorystore private IP after Step 5 of deploy |

---

### Full `.env` file for local development

Copy this to `.env` in the repo root and fill in your keys:

```env
# ── LLM ────────────────────────────────────────────────────────────────
LLM_PROVIDER=groq                         # use groq for local dev
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx     # required — get from console.groq.com

# Production LLM (set LLM_PROVIDER=anthropic when ready)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx       # get from console.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-5

# ── Monitoring ─────────────────────────────────────────────────────────
LANGSMITH_API_KEY=ls__xxxxxxxxxx          # get from smith.langchain.com
LANGSMITH_PROJECT=universal-rag-enterprise

# ── Vector DB ──────────────────────────────────────────────────────────
PINECONE_API_KEY=xxxxxxxx-xxxx-xxxx       # required — get from app.pinecone.io
PINECONE_INDEX_NAME=universal-rag         # leave as default

# ── Optional enhancements ──────────────────────────────────────────────
TAVILY_API_KEY=tvly-xxxxxxxxxx            # web search fallback (CRAG pattern)
COHERE_API_KEY=xxxxxxxxxx                 # cross-encoder reranking

# ── Auto-set by deploy_gcp.sh in production ───────────────────────────
# DATABASE_URL=                           # Cloud SQL — set automatically
# REDIS_URL=                              # Memorystore — set automatically
# JWT_SECRET=                             # generated automatically
```

---

## Environment Variables — Full Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | No | `groq` (local dev default) · `anthropic` (prod default) · `vertexai` (GCP-native) |
| `GROQ_API_KEY` | Yes (local dev) | Groq LLM + Whisper transcription — [console.groq.com](https://console.groq.com) |
| `ANTHROPIC_API_KEY` | Yes (production) | Anthropic Claude direct API — [console.anthropic.com](https://console.anthropic.com) |
| `ANTHROPIC_MODEL` | No | Model ID (default: `claude-sonnet-4-5`) |
| `LANGSMITH_API_KEY` | Recommended | LangSmith tracing — [smith.langchain.com](https://smith.langchain.com) |
| `LANGSMITH_PROJECT` | No | Project name (default: `universal-rag-enterprise`) |
| `LANGCHAIN_TRACING_V2` | No | Auto-set to `true` by deploy scripts when `LANGSMITH_API_KEY` is present |
| `PINECONE_API_KEY` | Yes (always) | Vector database — [app.pinecone.io](https://app.pinecone.io) |
| `PINECONE_INDEX_NAME` | No | Index name (default: `universal-rag`) — auto-created |
| `TAVILY_API_KEY` | Optional | Web search fallback for CRAG — [app.tavily.com](https://app.tavily.com) |
| `COHERE_API_KEY` | Optional | Cross-encoder reranking — [dashboard.cohere.com](https://dashboard.cohere.com) |
| `VERTEXAI_PROJECT` | vertexai only | GCP project ID (auto-set on Cloud Run) |
| `VERTEXAI_LOCATION` | No | Vertex AI region (default: `us-east5`) |
| `VERTEXAI_MODEL` | No | Model ID (default: `claude-sonnet-4-5@20251205`) |
| `JWT_SECRET` | Production | Auto-generated by `deploy_gcp.sh` — stored in Secret Manager |
| `DATABASE_URL` | Production | Auto-set by `deploy_gcp.sh` — Cloud SQL Unix socket connection string |
| `REDIS_URL` | Production | Auto-set by `deploy_gcp.sh` — Memorystore private IP URL |
| `ENVIRONMENT` | Production | Set to `production` |

---

## Production Deployment

### Option A — Cloud Run (Serverless, Recommended)

Fully managed — no cluster, no nodes, no infrastructure to maintain. Two scripts do everything.

---

#### Script 1 — Pre-flight check (`scripts/preflight_check.sh`)

Run this **before** the deploy. It checks every prerequisite and tells you exactly what to fix before you start.

```bash
cd universal-rag-agent-enterprise
export PROJECT_ID=your-gcp-project-id
bash scripts/preflight_check.sh
```

What it checks:
- `gcloud`, `docker`, `git`, `python` are installed and on PATH
- You are in the correct repo root directory
- `PROJECT_ID` env var is exported
- GCP Application Default Credentials (ADC) file exists locally
- All API keys are exported (warns — not fails — if missing, since `deploy_gcp.sh` prompts for them)

Completes in under 5 seconds — no network calls, no processes spawned.

> **One manual step that cannot be scripted:** Before deploying, enable Vertex AI Claude in the GCP Console:
> `console.cloud.google.com/vertex-ai/model-garden` → search **Claude** → **Enable**
> If you skip this, Cloud Run deploys fine but every LLM call returns `403 Permission Denied`.

Once preflight shows all green, run the deploy script.

---

#### Script 2 — Full GCP deploy (`scripts/deploy_gcp.sh`)

```bash
bash scripts/deploy_gcp.sh
```

Provisions your **entire production infrastructure** in 9 sequential steps (~15 minutes total). Each step is idempotent — safe to re-run if anything fails midway.

**What the script prompts for (paste keys when asked):**
```
PINECONE_API_KEY   → pinecone.io dashboard
ANTHROPIC_API_KEY  → console.anthropic.com
LANGSMITH_API_KEY  → smith.langchain.com
GROQ_API_KEY       → console.groq.com
TAVILY_API_KEY     → tavily.com
COHERE_API_KEY     → cohere.com
```

---

**Step 1 — Enable GCP APIs** (~1 min)

Turns on 10 GCP services your project needs: Cloud Run, Cloud SQL Admin, Redis (Memorystore), VPC Access, Vertex AI, Artifact Registry, Secret Manager, Cloud Build, Compute Engine, and Service Networking. These are off by default on a new GCP project.

---

**Step 2 — Artifact Registry** (~30s)

Creates a private Docker image repository called `rag-repo` in your region. All built images (FastAPI + Next.js) are stored here — not on Docker Hub. Also runs `gcloud auth configure-docker` so your local Docker can push to it. Skips silently if the repo already exists.

---

**Step 3 — Cloud SQL PostgreSQL** (~5 min) *(replaces postgres container)*

- Creates a PostgreSQL 16 instance named `rag-postgres` with auto-growing storage, daily backups at 2am, and point-in-time recovery enabled
- Creates the `ragdb` database inside it
- Creates the `raguser` account with a randomly generated 24-character password
- Saves the password to Secret Manager as `db-password` on first run — re-uses it on subsequent runs so the connection string stays consistent
- Builds the connection string using the Unix socket path format Cloud Run requires (`?host=/cloudsql/...`) — no public IP needed

---

**Step 4 — Serverless VPC Access connector** (~2 min)

Creates a VPC connector (`rag-vpc-connector`) that bridges Cloud Run to your VPC. This is required because Memorystore Redis is VPC-internal only — Cloud Run containers cannot reach it without this connector. Without this step, all Redis calls would fail silently.

---

**Step 5 — Memorystore Redis** (~2 min) *(replaces redis container)*

Creates a managed Redis 7 instance named `rag-redis` (5GB, VPC-internal). After creation it fetches the private VPC IP address and constructs the `REDIS_URL` (`redis://IP:6379/0`) that the app uses for rate limiting and session caching.

---

**Step 6 — Pinecone index** (~30s) *(replaces ChromaDB container)*

Calls `scripts/create_pinecone_index.py` — creates the `universal-rag` index with `dimension=384` and `metric=cosine` if it does not already exist, then polls until Pinecone reports it ready. Idempotent — skips if the index already exists.

---

**Step 7 — Service account + IAM roles** (~30s)

Creates a GCP service account `rag-cloudrun-sa` and grants it exactly 4 roles:

| Role | Why |
|------|-----|
| `roles/aiplatform.user` | Cloud Run can call Vertex AI Claude without an API key |
| `roles/cloudsql.client` | Connect to Cloud SQL via Unix socket |
| `roles/secretmanager.secretAccessor` | Read secrets at runtime |
| `roles/vpcaccess.user` | Use the VPC connector to reach Memorystore |

---

**Step 8 — Secret Manager** (~30s)

Stores every credential the app needs as a named secret. If a secret already exists it adds a new version rather than failing. Also grants the Cloud Build service account access to secrets so the CI/CD pipeline can deploy without storing keys in the build config.

| Secret name | Value |
|-------------|-------|
| `db-password` | Auto-generated, persisted across re-runs |
| `database-url` | Cloud SQL Unix socket connection string |
| `redis-url` | Memorystore private IP URL |
| `jwt-secret` | Auto-generated 64-char hex |
| `anthropic-api-key` | From prompt |
| `langsmith-api-key` | From prompt |
| `pinecone-api-key` | From prompt |
| `groq-api-key` | From prompt |
| `tavily-api-key` | From prompt |
| `cohere-api-key` | From prompt |

---

**Step 9 — Build images → push → deploy Cloud Run** (~5 min)

Builds Docker images for both services, tags each with the current git commit SHA + `latest`, pushes to Artifact Registry, then deploys two Cloud Run services:

**`rag-api` (FastAPI backend):**
- Secrets pulled from Secret Manager at runtime — never baked into the image
- Cloud SQL attached via Unix socket (`--add-cloudsql-instances`)
- VPC connector attached for Memorystore access (`--vpc-connector`)
- `LLM_PROVIDER=anthropic` — uses Anthropic Claude in production
- `LANGCHAIN_TRACING_V2=true` — LangSmith traces every LLM call
- `--min-instances=1` (no cold starts) · `--max-instances=100` · `--concurrency=80` · 4GB RAM · 2 vCPU

**`rag-frontend` (Next.js UI):**
- `NEXT_PUBLIC_API_URL` baked in at build time pointing to the live FastAPI URL
- No secrets needed — all API calls go through the FastAPI backend
- `--min-instances=1` · `--max-instances=100` · `--concurrency=80` · 1GB RAM · 1 vCPU
- Cloud Run automatically provisions HTTPS with TLS certificates — no nginx, no load balancer config

Using the commit SHA tag means every deploy is traceable and rollbacks are one command:
```bash
gcloud run deploy rag-api --image=REGION-docker.pkg.dev/PROJECT/rag-repo/rag-api:<previous-sha>
```

---

**Step 3 — Run the DB schema** (after deploy)

Cloud SQL starts empty. Connect and apply the 10-table multi-tenant schema:

```bash
gcloud sql connect rag-postgres --user=raguser --database=ragdb --project=your-project-id
# At the psql prompt:
\i infra/postgres/init.sql
```

---

**Output after successful deploy:**
```
  UI  (Next.js)  : https://rag-frontend-xxxx-uc.a.run.app
  API (FastAPI)  : https://rag-api-xxxx-uc.a.run.app/api/docs
  Vector DB      : Pinecone (index: universal-rag)
  DB             : Cloud SQL PROJECT:REGION:rag-postgres
  Cache          : Memorystore IP:6379 (via VPC connector)
  LLM            : Anthropic Claude (claude-sonnet-4-5)
  Monitoring     : LangSmith (project: universal-rag-enterprise)
```

---

### Option B — GKE Autopilot (Kubernetes)

Use when you need persistent WebSocket connections, custom sidecars, or an existing K8s workflow. Uses the **same Docker images** pushed to Artifact Registry.

**Prerequisite:** Run `deploy_gcp.sh` first — it provisions Artifact Registry, Secret Manager, Cloud SQL, Memorystore, and the service account that GKE needs.

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1
bash scripts/setup_gke.sh
```

The script runs 8 steps:

| Step | What It Does |
|------|-------------|
| 1 | Authenticate Docker → Artifact Registry |
| 2 | Build API + Frontend Docker images locally |
| 3 | Push both images to Artifact Registry (not Docker Hub) |
| 4 | Create GKE Autopilot cluster (auto node management, ~5 min) |
| 5 | Workload Identity — pods get GCP SA permissions without key files |
| 6 | Grant cluster image pull access to Artifact Registry |
| 7 | Pull all secrets from Secret Manager → create `rag-secrets` K8s Secret |
| 8 | Apply `infra/k8s/deployment.yml` → Deployments + Services + HPAs |

**After deploy:**
```bash
kubectl get pods -n rag-agent
kubectl get svc -n rag-agent        # shows LoadBalancer external IPs
kubectl get hpa -n rag-agent        # shows autoscaler status
kubectl logs -n rag-agent deploy/rag-api -f
```

---

### Artifact Registry — Image Push Flow

All images go to **Artifact Registry** (GCP-private), not Docker Hub.

```bash
# Image name format: REGION-docker.pkg.dev/PROJECT/REPO/image:tag

# Authenticate once
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build with Artifact Registry tag
docker build -f Dockerfile \
  -t us-central1-docker.pkg.dev/MY_PROJECT/rag-repo/rag-api:v1 \
  -t us-central1-docker.pkg.dev/MY_PROJECT/rag-repo/rag-api:latest \
  .

# Push
docker push --all-tags us-central1-docker.pkg.dev/MY_PROJECT/rag-repo/rag-api
```

The `deploy_gcp.sh` and `setup_gke.sh` scripts handle this automatically.

---

### Cloud Run vs GKE — When to Use Which

Both options run the **same Docker images** from Artifact Registry. The choice is purely about the hosting model — not the application code.

| | Cloud Run | GKE Autopilot |
|---|---|---|
| **Node management** | None | None (Autopilot manages nodes) |
| **Cold starts** | Yes — mitigated by `--min-instances=1` | No — pods are always running |
| **Persistent WebSockets** | No | Yes |
| **Custom sidecars** | No | Yes |
| **Cost at low traffic** | Lower — pay per request, scales to zero | Higher — min 2 pods always running (~$50–80/month minimum) |
| **Setup complexity** | ~15 min via `deploy_gcp.sh` | ~25 min via `setup_gke.sh` + GKE cluster |
| **Best for** | Most enterprise deployments | Specific K8s requirements only |

---

#### Node management

**Cloud Run** — Google manages everything. There are no nodes, no node pools, no VM sizes to choose, no OS patches. You deploy a container image and Cloud Run handles the rest.

**GKE Autopilot** — Google manages the nodes for you (unlike Standard GKE where you manage node pools yourself). However, you still manage Kubernetes objects — Deployments, Services, HPAs, Secrets, Namespaces. There is more control but also more responsibility.

---

#### Cold starts

**Cloud Run** — when a service receives a request and no container is running, GCP spins one up. This takes 2–8 seconds depending on image size and startup time. For the FastAPI container this means the first request after a period of inactivity is slow.

**Fix used in this project:** `--min-instances=1` keeps one container always warm. This adds a small cost (~$5–10/month) but eliminates cold starts entirely. The trade-off is worth it for production enterprise.

**GKE** — pods are always running (min 2 replicas in `deployment.yml`). No cold starts, but you pay for those pods 24/7 regardless of traffic.

---

#### Persistent WebSockets

**Cloud Run** — HTTP/2 streaming is supported but true long-lived WebSocket connections are unreliable. Cloud Run has a request timeout (max 3600s) and no guarantee the same container handles both sides of a WebSocket upgrade. Not suitable for real-time bidirectional communication.

**GKE** — pods are long-running processes. WebSocket connections persist for as long as the pod is alive. Use GKE if your enterprise needs real-time features like live document collaboration, streaming query results, or push notifications.

---

#### Custom sidecars

**Cloud Run** — one container per service. You cannot run a second container alongside it (e.g. a logging agent, a secrets sync container, a service mesh proxy like Envoy).

**GKE** — a Pod can have multiple containers. Common enterprise sidecars include:
- **Cloud SQL Auth Proxy** — sidecar handles Cloud SQL auth instead of Unix socket
- **Envoy / Istio** — service mesh for mTLS between microservices
- **Fluent Bit** — log forwarding sidecar
- **Secrets Store CSI driver** — syncs Secret Manager into pod filesystem

---

#### Cost at low traffic

**Cloud Run** — billed per request (CPU + memory × seconds of actual request handling). If no requests come in, you pay only for the 1 warm instance (`--min-instances=1`). At low traffic this is the cheapest option.

**GKE Autopilot** — billed per pod by CPU + memory × time running. With `minReplicas=2` in the HPA, you always pay for at least 2 pods. At 4Gi/2CPU per pod, the minimum cost is roughly $80–120/month even with zero traffic.

**Cost comparison at 10,000 requests/month (typical early enterprise):**

| | Cloud Run | GKE Autopilot |
|---|---|---|
| Compute | ~$5–15 | ~$80–120 |
| Pay model | Per request | Per pod-hour |
| Scales to zero | Yes (but min-instances=1 keeps 1 warm) | No |

At high traffic (millions of requests/month), the gap narrows — GKE can be more cost-efficient at sustained load.

---

#### Setup complexity

**Cloud Run** — `bash scripts/deploy_gcp.sh` provisions everything in ~15 minutes. No `kubectl`, no YAML manifests to manage, no cluster to maintain.

**GKE Autopilot** — requires running `deploy_gcp.sh` first (for shared infrastructure), then `bash scripts/setup_gke.sh` for the cluster. You also need `kubectl` installed and manage K8s objects (Deployments, Services, HPAs, Secrets). Total setup ~25 minutes. Ongoing maintenance is higher.

---

#### Decision guide — which to pick

**Choose Cloud Run if:**
- You are starting a new enterprise deployment
- Your team does not already use Kubernetes
- You want zero infrastructure maintenance
- Traffic is bursty or unpredictable
- You do not need WebSockets or sidecars

**Choose GKE Autopilot if:**
- Your organisation already has a GKE cluster and K8s expertise
- You need persistent WebSocket connections (real-time features)
- You need sidecar containers (service mesh, custom log agents)
- You have sustained high traffic where pod-hour pricing is cheaper
- You need fine-grained pod placement or node selectors

> **This project defaults to Cloud Run.** GKE support is fully wired via `scripts/setup_gke.sh` and `infra/k8s/deployment.yml` for teams that need it.

---

## Deployment vs Build/Test Pipeline — What Is the Difference?

Before reading the sections below, it helps to understand that these are **two completely separate concerns** that work together.

---

**Build/Test Pipeline** answers: *"Is the code good enough to ship?"*
- Runs quality checks — lint, type check, security scan
- Runs 81 tests and enforces 70% coverage
- If all checks pass, builds Docker images and stores them in Artifact Registry
- **Output: Docker images sitting in Artifact Registry, ready to be deployed**

**Deployment (Option A — Cloud Run, or Option B — GKE)** answers: *"Where do those images run?"*
- Takes the Docker images from Artifact Registry
- Provisions the infrastructure — Cloud SQL, Memorystore, Pinecone, Secret Manager
- Puts the containers live on Cloud Run or GKE
- **Output: A live running application with a public HTTPS URL**

---

Think of it like a restaurant kitchen:

```
Build/Test Pipeline           Deployment
────────────────────          ──────────────────────────────────
"Prepare and quality-         "Serve it to customers"
 check the dish"
                        →
Code → Test → Docker          Infrastructure → Live App
image in Artifact             with public URL
Registry
```

The Build/Test Pipeline **never touches live infrastructure**. It only validates code and produces images. The Deployment step is what actually makes the application reachable.

---

**How the two connect — three scenarios:**

```
─────────────────────────────────────────────────────────────────────
Scenario 1: Day-to-day development (after first-time setup)
─────────────────────────────────────────────────────────────────────

  You write code
       │
       ▼
  git push
       │
       └──► Cloud Build triggers automatically (cloudbuild.yaml)
                 │
                 ├── Steps 1–9  : Build/Test Pipeline
                 │   (lint → typecheck → security → tests → docker build → push)
                 │
                 └── Steps 10–11: Deployment
                     (gcloud run deploy → live on Cloud Run)

  Cloud Build runs BOTH in one automated pipeline on every push.
  You never run either script manually after first-time setup.

─────────────────────────────────────────────────────────────────────
Scenario 2: First-time infrastructure setup (run once only)
─────────────────────────────────────────────────────────────────────

  bash scripts/preflight_check.sh    ← verify prerequisites
  bash scripts/deploy_gcp.sh         ← provision ALL GCP infrastructure
                                        (Cloud SQL, Memorystore, Pinecone,
                                         Secret Manager, VPC connector,
                                         Service Account, IAM roles)
                                        + build images + deploy to Cloud Run

  After this runs once, all future deploys happen via Cloud Build (Scenario 1).
  You do not run deploy_gcp.sh again unless rebuilding from scratch.

─────────────────────────────────────────────────────────────────────
Scenario 3: Local check before pushing (optional but recommended)
─────────────────────────────────────────────────────────────────────

  bash scripts/build_and_test.sh     ← runs the Build/Test pipeline locally
                                        catches failures before Cloud Build does
                                        does NOT deploy anything

  git push                           ← then push — Cloud Build takes over
```

---

**Summary table:**

| | Build/Test Pipeline | Deployment |
|---|---|---|
| **Script (local)** | `scripts/build_and_test.sh` | `scripts/deploy_gcp.sh` (first time) |
| **Script (K8s)** | Same | `scripts/setup_gke.sh` (first time) |
| **Automated** | `cloudbuild.yaml` steps 1–9 | `cloudbuild.yaml` steps 10–11 |
| **What it does** | Validates code, builds Docker images | Provisions infra, puts images live |
| **Touches live infra?** | No | Yes |
| **Runs how often?** | Every `git push` | Once for setup; then Cloud Build handles it |
| **Output** | Docker images in Artifact Registry | Live app with public URL |
| **If it fails** | No images produced, nothing deployed | Infrastructure may be partially created |

---

## Build and Test Pipeline

The pipeline answers one question before every deployment: **"Is this code safe to ship?"**

It enforces a strict rule — **Docker images are only produced after all tests pass.** You can never accidentally deploy untested code because the build steps are blocked behind the test gate. If any stage fails, the pipeline stops immediately and the remaining stages are skipped.

There are two pipelines that share the same rules:

| Pipeline | When it runs | Script |
|----------|-------------|--------|
| **Local** | Before you push — run manually on your machine | `scripts/build_and_test.sh` |
| **Cloud Build (CI/CD)** | Automatically on every `git push` | `cloudbuild.yaml` |

---

### Local Pipeline (`scripts/build_and_test.sh`)

Run this on your machine before pushing code or deploying manually.

```bash
bash scripts/build_and_test.sh
```

It runs **7 stages in order**. Each stage must pass before the next one starts. If any stage fails the script exits immediately — stages after the failure never run.

```
Stage 1 → Lint
Stage 2 → Type check          ← code quality gates
Stage 3 → Security scan
         ─────────────────────────────────────────────
Stage 4 → Tests + coverage    ← THE GATE: nothing below runs unless this is green
         ─────────────────────────────────────────────
Stage 5 → Build API image
Stage 6 → Build Frontend image ← Docker images only produced after green tests
Stage 7 → Smoke test
```

---

**Stage 1 — Lint (`ruff`)**

Checks code style, import ordering, unused variables, and common Python mistakes across `src/`, `api/`, and `tests/`. Ruff catches things like:
- Unused imports left behind after refactoring
- Variables defined but never used
- Wrong string quote style
- Imports not grouped correctly

```bash
ruff check src/ api/ tests/
```

Fast — runs in under 3 seconds. Fails the pipeline on any violation so style debt never accumulates.

---

**Stage 2 — Type check (`mypy`)**

Runs static type analysis on the Python code. Catches type mismatches before they become runtime errors — for example, passing a `str` where an `int` is expected, or calling a method that doesn't exist on an object.

```bash
mypy src/ api/ --ignore-missing-imports --no-error-summary
```

This is especially important for the LLM provider switching code — if you add a new provider and forget to handle it in a function, mypy will catch it before it reaches production.

---

**Stage 3 — Security scan (`bandit`)**

Bandit is a SAST (Static Application Security Testing) tool. It scans Python code for known security vulnerabilities such as:
- Hardcoded passwords or API keys in source code
- Use of insecure functions (`eval`, `pickle`, `subprocess` without shell=False)
- SQL injection risks
- Weak random number generation (using `random` instead of `secrets`)

```bash
bandit -r src/ api/ -ll -q
```

The `-ll` flag means only HIGH and MEDIUM severity issues fail the build — low-severity warnings are reported but do not block deployment.

---

**Stage 4 — Tests + coverage gate (`pytest`) ← THE GATE**

This is the most important stage. It runs all 81 tests and measures how much of the codebase the tests actually exercise.

```bash
pytest --cov=src --cov=api --cov-report=term-missing --cov-fail-under=70 -q
```

**The 70% coverage gate** means at least 70% of every line in `src/` and `api/` must be executed by the test suite. If coverage drops below 70%, the build fails — even if all individual tests pass. This prevents the codebase from growing untested code silently over time.

**All external services are mocked** — Pinecone, Redis, and the LLM are replaced with fake objects in `tests/conftest.py`. This means:
- Tests run in seconds, not minutes
- No API keys or credentials needed in CI
- Tests are deterministic — they return the same result every time regardless of network conditions

If this stage fails → **Stages 5, 6, and 7 never run. No Docker images are produced.**

---

**Stage 5 — Build API image (Docker)**

Builds the FastAPI backend into a Docker image using `Dockerfile`.

```bash
docker build -f Dockerfile -t rag-api:TAG .
```

Tagged with both the current git commit SHA (for traceability) and `latest`. Only runs because Stage 4 passed.

---

**Stage 6 — Build Frontend image (Docker)**

Builds the Next.js UI into a Docker image using `Dockerfile.nextjs`. Uses a multi-stage build — the final image is ~150MB and contains only the compiled output, not the source code or `node_modules`.

```bash
docker build -f Dockerfile.nextjs -t rag-frontend:TAG .
```

---

**Stage 7 — Smoke test**

Starts the API container locally, waits for it to be ready, hits the health endpoint, then stops the container.

```bash
# What the script does internally:
docker run -d --name rag-smoke -p 18000:8000 -e LLM_PROVIDER=groq ... rag-api:TAG
# waits up to 40 seconds for the container to be healthy
curl -sf http://localhost:18000/api/health   # must return {"status": "ok"}
docker rm -f rag-smoke
```

This catches problems that pass unit tests but break at startup — missing imports, misconfigured environment variables, port binding errors, or startup exceptions. The container must respond within 40 seconds or the stage fails.

```bash
# Skip stages 1–3 for faster iteration during development
bash scripts/build_and_test.sh --skip-lint
```

---

### Cloud Build Pipeline — CI/CD (`cloudbuild.yaml`)

Triggered **automatically on every `git push`** to the repository. Runs on Google Cloud Build infrastructure — you do not need Docker or Python installed on a build server.

```
git push
    │
    └── Cloud Build triggers automatically
            │
            ▼
    ┌─────────────────────────────────────────────────────┐
    │  Steps 1–4: Quality gates (run in parallel)         │
    │  ├── Install dependencies                           │
    │  ├── Lint (ruff)                                    │
    │  ├── Type check (mypy)                              │
    │  └── Security scan (bandit)                         │
    └─────────────────────┬───────────────────────────────┘
                          │ all must pass
                          ▼
    ┌─────────────────────────────────────────────────────┐
    │  Step 5: pytest + 70% coverage gate  ← THE GATE    │
    └─────────────────────┬───────────────────────────────┘
                          │ must be green — blocks everything below
                          ▼
    ┌─────────────────────────────────────────────────────┐
    │  Steps 6–7: Build Docker images (parallel)          │
    │  ├── docker build Dockerfile      → rag-api         │
    │  └── docker build Dockerfile.nextjs → rag-frontend  │
    └─────────────────────┬───────────────────────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────────────────────┐
    │  Steps 8–9: Push to Artifact Registry (parallel)    │
    │  ├── push rag-api:COMMIT_SHA + :latest              │
    │  └── push rag-frontend:COMMIT_SHA + :latest         │
    └─────────────────────┬───────────────────────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────────────────────┐
    │  Steps 10–11: Deploy to Cloud Run                   │
    │  ├── gcloud run deploy rag-api                      │
    │  └── gcloud run deploy rag-frontend                 │
    └─────────────────────┬───────────────────────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────────────────────┐
    │  Step 12: Upload coverage.xml to GCS bucket         │
    │  (for coverage trend tracking over time)            │
    └─────────────────────────────────────────────────────┘
```

**Key rules enforced by `waitFor` in `cloudbuild.yaml`:**
- Steps 6–7 (Docker builds) have `waitFor: [test]` — they cannot start until Step 5 passes
- Step 11 (deploy frontend) has `waitFor: [push-frontend, deploy-api]` — frontend is only deployed after the API is live and its URL is known (so `NEXT_PUBLIC_API_URL` can be set correctly)
- **If Step 5 fails — Steps 6 through 12 never run. No images are built. Nothing is deployed.**

Each image is tagged with `$COMMIT_SHA` — the exact git commit that produced it. This means:
- Every deployed version is traceable back to a specific commit
- Rolling back is one command: `gcloud run deploy rag-api --image=...:<previous-sha>`
- You can see exactly what code is running in production at any time

---

### Test Suite — What Each File Tests

Run tests locally at any time (no credentials needed — all external services are mocked):

```bash
pip install -r requirements-dev.txt -r requirements-api.txt
pytest
```

| File | What It Tests | Why It Matters | Tests |
|------|--------------|----------------|-------|
| `test_api.py` | Health endpoint, user register, login, token refresh, protected route access | Verifies the entire auth flow works end to end | 14 |
| `test_vector_store.py` | Pinecone ingest, retrieve, namespace isolation between tenants, error handling | Ensures documents go into the right tenant's namespace and retrieval is accurate | 13 |
| `test_rate_limit.py` | Redis rate limiter enforces limits, returns 429 on breach, fails open if Redis is down | Protects the API from abuse; fail-open ensures Redis outage doesn't block all traffic | 8 |
| `test_llm.py` | All 3 providers switch correctly, grade() scores answers, retry on transient errors | Verifies LLM_PROVIDER switching works and quality scoring is reliable | 11 |
| `test_query_analyzer.py` | All 5 dimensions scored correctly, pattern selected, deduplication, handles bad JSON | The query analyzer drives all routing — errors here affect every query | 15 |
| `test_security.py` | Prompt injection blocked, PII detected and redacted, file upload validation | Enterprise security — ensures malicious inputs are caught before reaching the LLM | 20 |
| **Total** | | | **81** |

**Coverage gate: 70% minimum** — enforced in both `pytest.ini` (local) and `cloudbuild.yaml` (CI). The build fails if coverage drops below this threshold, even if all 81 tests pass individually.

---

## What Managed Services Replace

| BEFORE (single container) | AFTER (managed) | Benefit |
|---|---|---|
| ChromaDB container | **Pinecone** | Unlimited vectors, per-tenant namespaces, <100ms latency |
| PostgreSQL container | **Cloud SQL** | 4000 connections, auto-failover, 64TB, daily backups |
| Redis container | **Memorystore** | 300GB, persistent, VPC-internal, no eviction surprises |
| Groq (hardcoded) | **Anthropic Claude** (`LLM_PROVIDER=anthropic`) | Enterprise SLA, no rate limits |
| — | **Vertex AI Claude** (`LLM_PROVIDER=vertexai`) | GCP-native, ADC auth, no API key |
| No monitoring | **LangSmith** | Full LLM trace, cost, latency, quality per query |
| Docker Hub | **Artifact Registry** | Private GCP registry, IAM-controlled, VPC-native pulls |
| FastAPI VM container | **Cloud Run / GKE** | 1→100 auto-scale, pay per request |
| Streamlit VM container | **Next.js 14 on Cloud Run / GKE** | Proper auth, role-based UI, responsive, 1→100 auto-scale |

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

Rate limit state is stored in Redis/Memorystore — consistent across all instances. Fails open (requests pass) if Redis is unavailable.

---

## Observability

### Prometheus Metrics

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

### LangSmith Traces

| What | Where in LangSmith |
|------|--------------------|
| Full prompt + response | Runs → expand any run |
| Token count + cost | Run detail → Metadata |
| Latency per pattern | Dashboard → filter by tag |
| Quality score (grade output) | Runs → Feedback tab |
| Hallucination flags | Runs → check_faithfulness output |

---

## 4 LLM Roles

| Role | Responsibility |
|------|----------------|
| **Synthesizer** | Generates the final answer from retrieved chunks |
| **Grader** | Scores answer quality (0.0–1.0) across relevance, completeness, hallucination risk |
| **Verifier** | Checks faithfulness — every sentence must be supported by a source chunk |
| **Judge** | Resolves conflicting information across sources |

## 4 Memory Layers

| Layer | Purpose |
|-------|---------|
| **Conversation History** | Tracks dialogue context per session |
| **Pattern Performance** | Learns which patterns work best per query type |
| **Routing Signals** | Improves future routing decisions |
| **Verified Knowledge Cache** | Stores high-confidence answers (score ≥ 0.85) for instant reuse |

---

## Pinecone Index Setup

Auto-created — no manual step required.

- **Via `setup.sh`** — runs during initial local setup
- **Via `scripts/create_pinecone_index.py`** — standalone script, idempotent
- **Via `vector_store.py`** — `_ensure_index()` creates on first `retrieve()` or `ingest()` call if index is missing

Index spec: `dimension=384, metric=cosine` — matches `all-MiniLM-L6-v2` output.

---

## Repositories

| Repo | Description |
|------|-------------|
| [universal-rag-agent-enterprise](https://github.com/mshan011181/universal-rag-agent-enterprise) | This repo — managed services, Cloud Run, GKE, Anthropic, LangSmith |
| [universal-rag-agent](https://github.com/mshan011181/universal-rag-agent) | Original single-VM version with local Docker containers |

---

## License

Copyright (c) 2025 Shan. All rights reserved.

Viewing and downloading this code is permitted for reference and educational purposes only. Modification, redistribution, commercial use, and derivative works are strictly prohibited without prior written permission from the author.

---

## Author

**Shan** — AI Engineer

Built with Anthropic Claude, LangSmith, LangChain, Pinecone, Next.js 14, FastAPI, Google Cloud Run, GKE, and Artifact Registry.

GitHub: [https://github.com/mshan011181/universal-rag-agent-enterprise](https://github.com/mshan011181/universal-rag-agent-enterprise)
