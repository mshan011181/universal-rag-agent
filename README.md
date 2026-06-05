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

| Layer | Local Dev | Production |
|-------|-----------|------------|
| **LLM (default)** | Groq Llama 3.3-70b (`LLM_PROVIDER=groq`) | **Anthropic Claude Sonnet** (`LLM_PROVIDER=anthropic`) |
| **LLM (GCP-native alt)** | — | Vertex AI Claude via ADC (`LLM_PROVIDER=vertexai`) |
| **LLM Monitoring** | LangSmith (optional) | **LangSmith** — traces all 3 providers automatically |
| **Vector DB** | Pinecone (same in both) | Pinecone — unlimited, per-tenant namespaces |
| **Relational DB** | PostgreSQL container | Cloud SQL PostgreSQL — 4000 conns, auto-failover, 64TB |
| **Cache / Rate limit** | Redis container | Memorystore — 300GB, persistent, sharded |
| **API** | FastAPI + uvicorn | Cloud Run **or** GKE Autopilot (1–100 auto-scale) |
| **UI** | Next.js 14 + Tailwind CSS (replaces Streamlit) | Cloud Run **or** GKE Autopilot (1–100 auto-scale) |
| **Container Registry** | Local | **Artifact Registry** (not Docker Hub) |
| **Embeddings** | sentence-transformers all-MiniLM-L6-v2 (local) | Same — no API key needed |
| **Transcription** | Groq Whisper large-v3 | Same |
| **Orchestration** | LangChain 0.3.x + LangGraph | Same |
| **Auth** | JWT (python-jose) + bcrypt | Same, secrets in Secret Manager |
| **Observability** | Prometheus + Grafana + structlog | Same + Cloud Logging + **LangSmith** |
| **Reranking** | Cohere cross-encoder + RRF | Same |
| **CI/CD** | `scripts/build_and_test.sh` | Cloud Build → Artifact Registry → Cloud Run / GKE |

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

**Option A — Docker Compose (recommended, runs everything)**
```bash
docker-compose up -d --build
```

| Service | URL |
|---------|-----|
| Next.js UI | http://localhost:3000 |
| FastAPI Swagger | http://localhost:8000/api/docs |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin/admin) |

**Option B — Next.js dev server** (hot-reload, faster iteration)
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
# Open http://localhost:3000
```
Then start the FastAPI backend separately:
```bash
uvicorn api.main:app --reload --port 8000
```

---

## Production UI — Next.js 14 (replaces Streamlit)

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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | No | `anthropic` (prod default) · `vertexai` · `groq` (local dev) |
| `ANTHROPIC_API_KEY` | Production | Anthropic Claude direct API key |
| `ANTHROPIC_MODEL` | No | Model ID (default: `claude-sonnet-4-5`) |
| `LANGSMITH_API_KEY` | Production | LangSmith API key for tracing |
| `LANGSMITH_PROJECT` | No | Project name (default: `universal-rag-enterprise`) |
| `LANGCHAIN_TRACING_V2` | No | Set to `true` to enable tracing (auto-set in deploy scripts) |
| `GROQ_API_KEY` | Local dev | Groq API key — LLM and Whisper transcription |
| `PINECONE_API_KEY` | Yes | Pinecone API key — vector database |
| `PINECONE_INDEX_NAME` | No | Index name (default: `universal-rag`) |
| `VERTEXAI_PROJECT` | vertexai only | GCP project ID |
| `VERTEXAI_LOCATION` | No | Vertex AI region (default: `us-east5`) |
| `VERTEXAI_MODEL` | No | Model ID (default: `claude-sonnet-4-5@20251205`) |
| `TAVILY_API_KEY` | Optional | Web search fallback (CRAG pattern) |
| `COHERE_API_KEY` | Optional | Cross-encoder reranking |
| `JWT_SECRET` | Production | JWT token signing secret |
| `DATABASE_URL` | Production | Cloud SQL connection string (auto-set by deploy script) |
| `REDIS_URL` | Production | Memorystore connection string (auto-set by deploy script) |
| `ENVIRONMENT` | Production | Set to `production` |

---

## Production Deployment

### Option A — Cloud Run (Serverless, Recommended)

Fully managed — no cluster, no nodes, no infrastructure to maintain.

**Step 1 — Pre-flight check**
```bash
export PROJECT_ID=your-gcp-project-id
bash scripts/preflight_check.sh
```
Validates tools, credentials, env vars, and ADC. Completes in under 5 seconds.

**Step 2 — Deploy everything**
```bash
bash scripts/deploy_gcp.sh
```

The script provisions 9 steps end-to-end (~15 minutes total):

| Step | What It Provisions | Time |
|------|--------------------|------|
| 1 | Enable 10 GCP APIs | ~1 min |
| 2 | Artifact Registry repo | ~30s |
| 3 | Cloud SQL PostgreSQL (auto-grow, daily backup, point-in-time recovery) | ~5 min |
| 4 | Serverless VPC connector (required for Memorystore access) | ~2 min |
| 5 | Memorystore Redis 7 (5GB, VPC-internal) | ~2 min |
| 6 | Pinecone index (idempotent — skips if exists) | ~30s |
| 7 | Service account + 4 IAM roles | ~30s |
| 8 | All secrets in Secret Manager (Anthropic, LangSmith, Pinecone, DB, Redis, JWT) | ~30s |
| 9 | Docker build → push to Artifact Registry → Cloud Run deploy (API + Frontend) | ~5 min |

**What the deploy script prompts for:**
```
PINECONE_API_KEY   → pinecone.io dashboard
ANTHROPIC_API_KEY  → console.anthropic.com
LANGSMITH_API_KEY  → smith.langchain.com
GROQ_API_KEY       → console.groq.com
TAVILY_API_KEY     → tavily.com
COHERE_API_KEY     → cohere.com
```

**Step 3 — Run DB schema**
```bash
gcloud sql connect rag-postgres --user=raguser --database=ragdb --project=your-project-id
# At the psql prompt:
\i infra/postgres/init.sql
```

Output after deploy:
```
  UI  (Next.js)  : https://rag-frontend-xxxx-uc.a.run.app
  API (FastAPI)  : https://rag-api-xxxx-uc.a.run.app/api/docs
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

| | Cloud Run | GKE Autopilot |
|---|---|---|
| Node management | None | None (Autopilot) |
| Cold starts | Yes (min-instances=1 avoids) | No |
| Persistent WebSockets | No | Yes |
| Custom sidecars | No | Yes |
| Cost at low traffic | Lower (pay per request) | Higher (min 2 pods always running) |
| Setup complexity | Simpler | More control |
| Best for | Most enterprise deployments | Specific K8s requirements |

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

```bash
# Skip lint for faster iteration
bash scripts/build_and_test.sh --skip-lint
```

### Cloud Build Pipeline (CI/CD)

Triggered on every `git push`. Defined in `cloudbuild.yaml`:

```
Steps 1–4  → install deps, lint, typecheck, security scan (parallel)
Step  5    → pytest with 70% coverage gate   ← GATE: images only built if green
Steps 6–7  → docker build API + Frontend     ← waitFor: [test]
Steps 8–9  → push to Artifact Registry
Steps 10–11→ deploy to Cloud Run (LLM_PROVIDER=anthropic, LangSmith tracing enabled)
Step  12   → upload coverage.xml to GCS
```

**If tests fail at step 5, the pipeline stops — no Docker images are produced.**

### Test Suite

```bash
pip install -r requirements-dev.txt -r requirements-api.txt
pytest
```

All external services (Pinecone, Redis, LLM) are mocked — zero network calls, no credentials needed in CI.

| File | What It Tests | Tests |
|------|--------------|-------|
| `test_api.py` | Health, auth register/login/refresh, protected routes | 14 |
| `test_vector_store.py` | Pinecone ingest/retrieve, namespace isolation, error handling | 13 |
| `test_rate_limit.py` | Redis rate limiter, 429 response, fail-open, expire called | 8 |
| `test_llm.py` | All 3 provider switching, grade, faithfulness, retry | 11 |
| `test_query_analyzer.py` | All 5 dimensions, pattern selection, deduplication, bad JSON | 15 |
| `test_security.py` | Injection detection, PII redaction, sanitization, upload validation | 20 |
| **Total** | | **81** |

Coverage gate: **70% minimum** enforced in both local pipeline and Cloud Build.

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
