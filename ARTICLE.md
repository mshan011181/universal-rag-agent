# Building Enterprise-Grade Universal RAG: From a Single VM to a Cloud-Native AI Platform

## A Complete Guide to Migrating, Scaling, and Monitoring a Production RAG System

---

## Introduction

Retrieval-Augmented Generation (RAG) is now a standard pattern in enterprise AI. But most RAG implementations are built for demos — a single Python script, a local vector store, and a hardcoded LLM call. When these hit production with real enterprise traffic, they collapse: the vector database runs out of memory, the database hits connection limits, the LLM provider rate-limits you, and the entire system goes down for every tenant simultaneously.

This article walks through the design and migration of the **Universal RAG Agent Enterprise** — a system that starts with 14 RAG patterns on a single VM and migrates every component to a managed, auto-scaling, monitored production platform on Google Cloud. Every architectural decision is explained, every trade-off is documented, and every component is mapped from its development equivalent to its production replacement.

---

## Part 1 — What Is the Universal RAG Agent?

### The Core Problem with Single-Pattern RAG

Most RAG implementations use one pattern: embed a query, search a vector store, feed chunks to an LLM, return the answer. This works for simple factual questions but breaks for:

- **Ambiguous queries** — "Tell me about the policy" (which policy? what aspect?)
- **Complex reasoning** — "Compare the Q3 performance across all business units and identify the root cause"
- **High-stakes domains** — Legal, medical, financial queries where hallucination is unacceptable
- **Follow-up questions** — "And what did he say about that in the 2022 report?"
- **Entity-relationship queries** — "Which executives are connected to the compliance breach?"

The Universal RAG Agent solves this by implementing **14 distinct RAG patterns** and automatically selecting the right one — or chaining multiple — for every query.

### The 5-Dimension Query Analyzer

Before any retrieval happens, every query passes through a **5-dimension analyzer** that scores it on:

```
┌─────────────────────────────────────────────────────────────────┐
│                    5-Dimension Query Analyzer                    │
├────────────────────┬────────────────────────────────────────────┤
│ Dimension          │ What it measures                           │
├────────────────────┼────────────────────────────────────────────┤
│ Length             │ Is the query very short (likely ambiguous) │
│                    │ or long (likely complex multi-part)?        │
├────────────────────┼────────────────────────────────────────────┤
│ Ambiguity          │ Does the query have multiple possible       │
│                    │ interpretations or missing context?         │
├────────────────────┼────────────────────────────────────────────┤
│ Complexity         │ Does it require multi-step reasoning,       │
│                    │ comparisons, or causal analysis?            │
├────────────────────┼────────────────────────────────────────────┤
│ Data Type          │ Is it asking about text, entities,          │
│                    │ relationships, images, or time-series?      │
├────────────────────┼────────────────────────────────────────────┤
│ Conversation State │ Is this a follow-up to a previous query?   │
│                    │ Does it depend on session history?          │
└────────────────────┴────────────────────────────────────────────┘
```

Based on these scores, the **Pattern Router** selects the optimal RAG pattern — or chains multiple patterns for complex queries.

### The 14 RAG Patterns

```
┌────┬──────────────────────┬──────────────────────────────────────────────────┐
│  # │ Pattern              │ Best For                                         │
├────┼──────────────────────┼──────────────────────────────────────────────────┤
│  1 │ Naive RAG            │ Simple factual queries — direct retrieval        │
│  2 │ HyDE                 │ Ambiguous/short queries — generate hypothesis    │
│  3 │ Query Rewriting      │ Vague queries — expand before retrieval          │
│  4 │ CRAG                 │ High-risk domains — verify before answering      │
│  5 │ Self-RAG             │ Complex reasoning — self-verify each step        │
│  6 │ Adaptive RAG         │ Mixed workloads — dynamic strategy selection     │
│  7 │ FLARE                │ Long-form generation — iterative retrieval       │
│  8 │ Speculative RAG      │ Hypothesis-then-verify approach                  │
│  9 │ Modular RAG          │ Configurable retrieval pipeline                  │
│ 10 │ Agentic RAG          │ Multi-tool, multi-step research tasks            │
│ 11 │ GraphRAG             │ Entity-relationship and network queries           │
│ 12 │ Multi-Modal RAG      │ Image and chart analysis                         │
│ 13 │ Conversational RAG   │ Follow-up questions with session history         │
│ 14 │ RAG Fusion           │ Multi-perspective retrieval for broad queries    │
└────┴──────────────────────┴──────────────────────────────────────────────────┘
```

**Advantage:** No other single RAG system implements all 14 patterns and auto-selects between them. Most enterprise implementations pick one or two patterns and apply them to every query — producing poor results for queries that do not fit that pattern.

---

## Part 2 — The Infrastructure Problem: Why Single-VM RAG Fails

### The Starting Point — Everything on One VM

The initial implementation ran every component as a Docker container on a single GCP VM:

```
┌─────────────────────────────────────────────────────────────┐
│                    Single GCP VM                             │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  FastAPI          │    │  Streamlit UI     │              │
│  │  (Python API)     │    │  (Data science    │              │
│  │  ~50 concurrent   │    │   prototype UI)   │              │
│  └──────────────────┘    └──────────────────┘              │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  ChromaDB         │    │  PostgreSQL       │              │
│  │  (Vector store)   │    │  (Relational DB)  │              │
│  │  in-memory        │    │  container        │              │
│  └──────────────────┘    └──────────────────┘              │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  Redis            │    │  Groq LLM         │              │
│  │  (Cache)          │    │  (hardcoded,      │              │
│  │  container        │    │   rate-limited)   │              │
│  └──────────────────┘    └──────────────────┘              │
│                                                             │
│  LLM Provider: Groq only (no switching, no SLA)            │
│  Monitoring: None                                           │
└─────────────────────────────────────────────────────────────┘
```

### What Breaks at Enterprise Scale

| Component | What Breaks | Why |
|---|---|---|
| **ChromaDB** | Slows then crashes | In-memory vector store has no persistence or sharding. At 100K+ documents it exhausts RAM |
| **PostgreSQL** | Connection limit hit | A container can handle ~100 connections. Enterprise with 50 concurrent users × connection pools = exceeded |
| **Redis** | Out of memory eviction | Container has fixed memory. Redis starts evicting cache entries, causing rate limit state to disappear |
| **FastAPI** | ~50 concurrent requests | Single container cannot scale horizontally. CPU-bound under load |
| **Streamlit** | ~20 concurrent users | Each user gets their own Python process — not suitable for enterprise multi-user |
| **Groq** | Rate limited | Free tier has strict tokens/min cap — fails under real enterprise query volume |
| **No monitoring** | Silent failures | No visibility into which queries fail, why answers are wrong, or what the cost is |

**The core problem:** When one component fails on a single VM, it takes down the entire system for every enterprise tenant simultaneously. There is no isolation, no scaling, no failover.

---

## Part 3 — The Migration: Before vs After

### Full Infrastructure Migration Map

```
BEFORE — Single VM                    AFTER — Managed Services
══════════════════════════════════════════════════════════════

All Enterprise Tenants                All Enterprise Tenants
         │                                     │
         ▼                                     ▼
    Single GCP VM                    Cloud Load Balancer
    (one point of failure)                     │
         │                          ┌──────────┴──────────┐
         │                          ▼                     ▼
    All services competing    Cloud Run              Cloud Run
    for same CPU/RAM          FastAPI (rag-api)      Next.js UI
                              1 → 100 containers     1 → 100 containers
    ChromaDB ──────────►  Pinecone (managed)
    PostgreSQL ────────►  Cloud SQL (managed)
    Redis ─────────────►  Memorystore (managed)
    Groq (hardcoded) ──►  Anthropic Claude API
    No monitoring ──────►  LangSmith (full trace)
    Streamlit ─────────►  Next.js 14 (proper UI)
    Docker Hub ─────────►  Artifact Registry (GCP)
```

### Component-by-Component Migration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              WHAT EACH COMPONENT WAS → WHAT IT BECAME                       │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ BEFORE               │ AFTER                │ BENEFIT                       │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ ChromaDB container   │ Pinecone (managed)   │ Unlimited vectors, per-tenant │
│ (in-memory, crashes) │                      │ namespaces, <100ms latency    │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ PostgreSQL container │ Cloud SQL            │ 4,000 connections, auto-      │
│ (connection limits)  │ (GCP managed)        │ failover, 64TB, daily backups │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Redis container      │ Memorystore          │ 300GB, persistent, VPC-       │
│ (OOM evictions)      │ (GCP managed)        │ internal, no evictions        │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Groq (hardcoded)     │ Anthropic Claude     │ 99.9% SLA, enterprise tier,   │
│ (no SLA, rate limits)│ (LLM_PROVIDER=anthro)│ better reasoning quality      │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ No monitoring        │ LangSmith            │ Full trace of every LLM call: │
│                      │                      │ cost, latency, quality, errors│
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Streamlit UI         │ Next.js 14 + React   │ Real auth, role-based views,  │
│ (prototype tool)     │                      │ SSO-ready, responsive         │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ FastAPI on VM        │ FastAPI on Cloud Run  │ 1→100 containers, pay per     │
│ (~50 concurrent)     │                      │ request, no idle cost         │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Docker Hub           │ Artifact Registry    │ Private GCP registry, IAM-    │
│ (public registry)    │ (GCP-private)        │ controlled, VPC-native pulls  │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

---

## Part 4 — The Full System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │             Enterprise Tenants                │
                    │    Tenant A    Tenant B    Tenant C ...       │
                    │  (isolated namespaces in Pinecone + Cloud SQL)│
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
                           ┌───────────────────────────┐
                           │     Cloud Load Balancer    │
                           │     (HTTPS, TLS, auto)     │
                           └──────────────┬────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
        ┌────────────────────────┐            ┌─────────────────────────┐
        │  Cloud Run / GKE       │            │  Cloud Run / GKE        │
        │  FastAPI  (rag-api)    │            │  Next.js 14 (rag-frontend)│
        │  1–100 containers      │            │  1–100 containers       │
        │  4GB RAM · 2 vCPU      │            │  1GB RAM · 1 vCPU       │
        └────────────┬───────────┘            └─────────────────────────┘
                     │                        (calls FastAPI via REST)
                     ▼
        ┌─────────────────────────────────────────────────┐
        │              Query Processing Pipeline           │
        │                                                 │
        │  ┌─────────────────────────────────────────┐   │
        │  │         Query Analyzer (5-dimension)     │   │
        │  │  length · ambiguity · complexity         │   │
        │  │  data_type · conversation_state          │   │
        │  └──────────────────┬──────────────────────┘   │
        │                     │                           │
        │                     ▼                           │
        │  ┌─────────────────────────────────────────┐   │
        │  │     Pattern Router → 14 RAG Patterns     │   │
        │  │  Sequential or parallel pattern chaining │   │
        │  └───┬───────────────┬───────────────────┘   │
        │      │               │                         │
        │      ▼               ▼               ▼         │
        │  ┌────────┐    ┌──────────┐    ┌──────────┐   │
        │  │Retrieve│    │  Rerank  │    │ Generate │   │
        │  │Pinecone│    │  Cohere  │    │  (LLM)   │   │
        │  │+ Tavily│    │  + RRF   │    │          │   │
        │  └────────┘    └──────────┘    └────┬─────┘   │
        │                                     │          │
        │            ┌──────────────────┐     │          │
        │            │ 4 LLM Roles      │◄────┘          │
        │            │ • Synthesizer    │                 │
        │            │ • Grader         │                 │
        │            │ • Verifier       │                 │
        │            │ • Judge          │                 │
        │            └────────┬─────────┘                │
        └─────────────────────┼───────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────┐
        │                LangSmith Tracing                 │
        │   Every call captured: tokens · latency · cost   │
        │   quality scores · full prompt/response traces   │
        └──────────┬──────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┬──────────────────┐
     ▼             ▼             ▼                   ▼
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐
│Pinecone │  │Cloud SQL │  │Memorystor│  │  4-Layer Memory  │
│Vector DB│  │PostgreSQL│  │Redis     │  │  • Conv. History │
│namespace│  │10-table  │  │Rate limit│  │  • Pattern Perf  │
│per tenant│ │multi-    │  │+ cache   │  │  • Routing Sigs  │
│         │  │tenant    │  │VPC-intern│  │  • Knowledge Cach│
└─────────┘  └──────────┘  └──────────┘  └─────────────────┘

        ┌─────────────────────────────────────────────────┐
        │         GCP Security Layer                       │
        │  Secret Manager · IAM · Service Account          │
        │  Workload Identity (GKE) · VPC connector         │
        └─────────────────────────────────────────────────┘
```

---

## Part 5 — Technology Stack: Development to Production

The system is designed so that **the same application code runs in both development and production** — only the infrastructure underneath changes.

```
┌──────────────────────────────────────────────────────────────────────┐
│               Development vs Production — Full Stack                  │
├─────────────────┬────────────────────────┬───────────────────────────┤
│ Layer           │ Local Development       │ Production                │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ API Application │ FastAPI (uvicorn)       │ FastAPI (same code)       │
│ API Hosting     │ localhost:8000          │ Cloud Run (1→100 conts)   │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ UI Application  │ Next.js 14 (node dev)  │ Next.js 14 (same code)    │
│ UI Hosting      │ localhost:3000          │ Cloud Run (1→100 conts)   │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ LLM             │ Groq Llama 3.3-70b     │ Anthropic Claude Sonnet   │
│                 │ (LLM_PROVIDER=groq)     │ (LLM_PROVIDER=anthropic)  │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ LLM Monitoring  │ LangSmith (optional)   │ LangSmith (required)      │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ Vector DB       │ Pinecone               │ Pinecone (same)           │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ Relational DB   │ postgres:16-alpine     │ Cloud SQL PostgreSQL       │
│                 │ (Docker container)     │ (GCP managed)             │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ Cache           │ redis:7-alpine         │ Memorystore Redis         │
│                 │ (Docker container)     │ (GCP managed, VPC)        │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ Auth            │ JWT + bcrypt           │ Same + Secret Manager     │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ Embeddings      │ all-MiniLM-L6-v2      │ Same (local, no API key)  │
│                 │ (local, no API key)    │                           │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ Transcription   │ Groq Whisper large-v3  │ Same                      │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ Container Reg   │ Local machine          │ Artifact Registry (GCP)   │
├─────────────────┼────────────────────────┼───────────────────────────┤
│ CI/CD           │ build_and_test.sh      │ Cloud Build (auto trigger) │
└─────────────────┴────────────────────────┴───────────────────────────┘
```

**Key design principle:** Switching from development to production is a single environment variable change — `LLM_PROVIDER=groq` becomes `LLM_PROVIDER=anthropic`. No code changes. No Dockerfile changes. The same image runs in both environments.

---

## Part 6 — Distinct Features and Their Advantages

### Feature 1: LLM Provider Switching with Zero Code Changes

```
┌──────────────────────────────────────────────────────────────┐
│                  LLM_PROVIDER env var                         │
│                                                              │
│   "groq"      →  Groq Llama 3.3-70b   (local dev / CI)      │
│   "anthropic" →  Anthropic Claude     (production default)   │
│   "vertexai"  →  Vertex AI Claude     (GCP-native option)    │
│                                                              │
│   All three route through the same get_llm() factory.        │
│   LangSmith traces all three automatically.                  │
└──────────────────────────────────────────────────────────────┘
```

**Advantage:** Development uses Groq (free, fast) to avoid burning Anthropic API credits during iteration. Production uses Anthropic Claude with a 99.9% SLA and enterprise rate limits. If you deploy to GCP and want zero external API calls, Vertex AI Claude uses Application Default Credentials — no API key needed on the pod.

| Provider | SLA | Rate Limits | Auth | Best For |
|---|---|---|---|---|
| Groq | None | Strict (free tier) | API key | Local dev, CI |
| Anthropic | 99.9% | High (enterprise) | API key | Production enterprise |
| Vertex AI | 99.9% | GCP quota | ADC (no key) | GCP-native deployments |

---

### Feature 2: LangSmith — End-to-End LLM Observability

Most production RAG systems are black boxes. You get an answer but have no idea why it was wrong, how much it cost, or which step failed.

LangSmith makes every LLM call transparent:

```
Query received
      │
      ▼
┌─────────────────────────────────────────────────────┐
│              LangSmith captures automatically:       │
│                                                     │
│  synthesize()  → full prompt + response             │
│               → token count: 847 input, 312 output  │
│               → latency: 1.2s                       │
│               → cost: $0.0034                       │
│                                                     │
│  grade()       → relevance: 0.92                    │
│               → completeness: 0.88                  │
│               → hallucination_risk: 0.04            │
│               → quality_score: 0.89                 │
│                                                     │
│  check_faithfulness() → all sentences supported     │
│                      → citation map: 3/3 verified   │
│                                                     │
│  generate_followups() → 3 follow-up questions       │
└─────────────────────────────────────────────────────┘
```

**What the LangSmith dashboard gives you:**
- Cost per query per enterprise tenant — identify expensive query patterns
- Latency p50/p95/p99 per RAG pattern — find slow patterns
- Hallucination risk trends over time — catch model degradation
- Full prompt replay for any failed query — debug without reproducing

**Advantage over Prometheus-only observability:** Prometheus tells you the API responded in 1.4 seconds. LangSmith tells you the LLM took 1.1 seconds, the quality score was 0.42 (low), the hallucination risk was 0.67 (high), and shows you the exact prompt that caused it — enabling root cause analysis on AI-specific failures that infrastructure metrics cannot capture.

---

### Feature 3: Per-Tenant Isolation at the Vector DB Layer

In a multi-tenant RAG system, the most critical isolation requirement is that Tenant A's documents never appear in Tenant B's query results.

Pinecone implements this via **namespaces**:

```
Pinecone Index: "universal-rag"
│
├── namespace: "tenant-acme"
│   ├── doc_001: Contract_v1.pdf embeddings
│   ├── doc_002: Policy_2024.docx embeddings
│   └── doc_003: Q3_Report.pdf embeddings
│
├── namespace: "tenant-globex"
│   ├── doc_001: Globex_Policy.pdf embeddings
│   └── doc_002: Globex_Contracts.pdf embeddings
│
└── namespace: "tenant-initech"
    └── doc_001: Initech_Handbook.pdf embeddings
```

Every `retrieve()` call passes `namespace=tenant_id`. Pinecone enforces the isolation at the query level — it is impossible to return results from a different namespace.

**Advantage:** Strict isolation without running separate vector databases per tenant. All tenants share the same managed Pinecone infrastructure, but their data is completely separated. Adding a new tenant requires no infrastructure changes — just use a new namespace.

---

### Feature 4: 4-Layer Self-Improving Memory

The system learns from its own operation over time:

```
┌─────────────────────────────────────────────────────────────┐
│                   4-Layer Memory Store                       │
├──────────────────────────┬──────────────────────────────────┤
│ Layer                    │ What it learns                   │
├──────────────────────────┼──────────────────────────────────┤
│ Conversation History     │ What was asked and answered in   │
│                          │ this session — enables follow-up  │
│                          │ questions without re-stating      │
│                          │ context                          │
├──────────────────────────┼──────────────────────────────────┤
│ Pattern Performance      │ Which RAG patterns produced high  │
│                          │ quality scores for which query    │
│                          │ types — routing improves over time│
├──────────────────────────┼──────────────────────────────────┤
│ Routing Signals          │ Which 5-dimension combinations    │
│                          │ led to good outcomes — analyzer   │
│                          │ gets better with usage           │
├──────────────────────────┼──────────────────────────────────┤
│ Verified Knowledge Cache │ Answers with quality_score ≥ 0.85│
│                          │ are cached. Identical queries     │
│                          │ return instantly — no LLM call   │
└──────────────────────────┴──────────────────────────────────┘
```

**Advantage:** The system gets measurably better the more it is used. A query that took 1.4 seconds and cost $0.003 on first run costs $0 and responds in <50ms if it is in the verified knowledge cache. Pattern routing accuracy improves as pattern performance data accumulates.

---

### Feature 5: 4 LLM Roles per Query

Each query uses the LLM not once, but four times in different roles:

```
Retrieved Chunks
      │
      ▼
┌─────────────────┐
│  SYNTHESIZER    │  Generates the answer from retrieved chunks only.
│                 │  Instructed to never use prior knowledge.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  GRADER         │  Scores the answer 0.0–1.0 on three dimensions:
│                 │  • relevance (does it address the query?)
│                 │  • completeness (does it use all relevant context?)
│                 │  • hallucination_risk (is any claim unsupported?)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  VERIFIER       │  Checks faithfulness: maps every sentence in the
│                 │  answer to a specific source chunk.
│                 │  Flags any sentence with no supporting evidence.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  JUDGE          │  Resolves conflicts when multiple chunks contradict
│                 │  each other — determines which source to trust and why.
└─────────────────┘
```

**Advantage:** This architecture makes the system self-auditing. The Grader and Verifier catch low-quality answers before they reach the user. If the quality score falls below 0.65 (the threshold), the system triggers CRAG's web search fallback to supplement with external information — rather than returning a poor answer.

---

### Feature 6: Production UI — Next.js 14 Replacing Streamlit

```
┌──────────────────────────────────────────────────────────────┐
│         Streamlit vs Next.js 14 — Production Comparison       │
├─────────────────────────┬────────────────────────────────────┤
│ Capability              │ Streamlit        │ Next.js 14       │
├─────────────────────────┼──────────────────┼──────────────────┤
│ Authentication UI       │ Hacked via       │ Proper login /   │
│                         │ session_state    │ register pages   │
├─────────────────────────┼──────────────────┼──────────────────┤
│ Role-based views        │ Not possible     │ Admin dashboard  │
│                         │                 │ hidden for users │
├─────────────────────────┼──────────────────┼──────────────────┤
│ SSO / SAML readiness    │ No              │ Yes — standard   │
│                         │                 │ OAuth2 flow      │
├─────────────────────────┼──────────────────┼──────────────────┤
│ Mobile responsive       │ No              │ Yes — Tailwind   │
├─────────────────────────┼──────────────────┼──────────────────┤
│ Concurrency             │ 1 Python process │ Node.js — 80     │
│                         │ per user         │ concurrent/inst  │
├─────────────────────────┼──────────────────┼──────────────────┤
│ Docker image size       │ ~500MB Python    │ ~150MB standalone│
├─────────────────────────┼──────────────────┼──────────────────┤
│ Production SLA          │ Not designed for │ Cloud Run grade  │
└─────────────────────────┴──────────────────┴──────────────────┘
```

The Next.js UI has four pages:

| Route | What it does |
|---|---|
| `/login` | JWT authentication → POST `/api/auth/token` |
| `/register` | Account creation → POST `/api/auth/register` |
| `/query` | RAG query with pattern picker, quality badge, collapsible sources, follow-up questions |
| `/ingest` | Drag-drop file upload (PDF/DOCX/TXT/CSV) + paste text, per-tenant namespace |
| `/admin` | KPI cards + RAG pattern usage bar chart — admin role only |

---

### Feature 7: Two Deployment Targets, Same Images

The same Docker images deploy to either Cloud Run or GKE Autopilot:

```
Artifact Registry
  ├── rag-api:abc1234
  └── rag-frontend:abc1234
        │
        ├── Cloud Run ──────────────── Serverless, 0 infrastructure mgmt
        │   gcloud run deploy          Pay per request
        │   --image=...rag-api:abc1234 Min 1 → Max 100 containers
        │                             Cold starts avoided via min-instances=1
        │
        └── GKE Autopilot ──────────── K8s, persistent WebSockets
            kubectl apply              Always running, min 2 pods
            -f infra/k8s/deployment.yml Pod-hour billing
```

**Decision guide:**

```
Do you need persistent WebSockets or custom sidecars?
      │
      ├── Yes → GKE Autopilot
      │
      └── No → Is traffic unpredictable or bursty?
                    │
                    ├── Yes → Cloud Run (pay per request, scales to 0)
                    │
                    └── No (sustained high traffic) → Compare cost:
                                Cloud Run vs GKE pod-hour billing
                                at your traffic volume
```

---

## Part 7 — The CI/CD Pipeline: Code to Production in One Push

### The Core Rule

**Docker images are only produced after all tests pass.** This is enforced by the `waitFor` directive in `cloudbuild.yaml` — the Docker build steps cannot start until the test step completes successfully.

### The Full Pipeline Flow

```
Developer writes code
        │
        ▼
  git push enterprise main
        │
        ├── Source code → GitHub (only source code, never images)
        │
        └── Cloud Build triggers automatically
                │
                ▼
        ┌───────────────────────────────────────────────┐
        │  Quality Gate (parallel)                      │
        │  ├── ruff lint (style, unused imports)        │
        │  ├── mypy type check (catch type errors)      │
        │  └── bandit security scan (SAST)              │
        └─────────────────────┬─────────────────────────┘
                              │ all must pass
                              ▼
        ┌───────────────────────────────────────────────┐
        │  pytest — 81 tests + 70% coverage gate        │
        │  ← THE GATE — nothing below runs if this fails│
        │                                               │
        │  All external services mocked:                │
        │  • Pinecone → MagicMock                       │
        │  • Redis → AsyncMock                          │
        │  • LLM → MagicMock (deterministic output)     │
        │  Zero network calls, no credentials needed    │
        └─────────────────────┬─────────────────────────┘
                              │ green
                              ▼
        ┌───────────────────────────────────────────────┐
        │  Build Docker images (parallel)               │
        │  ├── docker build Dockerfile → rag-api        │
        │  └── docker build Dockerfile.nextjs → rag-ui  │
        └─────────────────────┬─────────────────────────┘
                              │
                              ▼
        ┌───────────────────────────────────────────────┐
        │  Push to Artifact Registry (parallel)         │
        │  ├── rag-api:COMMIT_SHA + :latest             │
        │  └── rag-frontend:COMMIT_SHA + :latest        │
        └─────────────────────┬─────────────────────────┘
                              │
                              ▼
        ┌───────────────────────────────────────────────┐
        │  Deploy to Cloud Run                          │
        │  ├── gcloud run deploy rag-api                │
        │  └── gcloud run deploy rag-frontend           │
        │      (after rag-api is live — needs its URL)  │
        └─────────────────────┬─────────────────────────┘
                              │
                              ▼
                    App is live in production
```

### Test Suite Coverage

| Test File | What It Protects | Tests |
|---|---|---|
| `test_api.py` | Auth flow, JWT, protected routes | 14 |
| `test_vector_store.py` | Pinecone namespace isolation per tenant | 13 |
| `test_rate_limit.py` | Redis rate limiting, fail-open on Redis outage | 8 |
| `test_llm.py` | All 3 provider switching, quality grading, retry | 11 |
| `test_query_analyzer.py` | 5-dimension routing accuracy | 15 |
| `test_security.py` | Prompt injection, PII redaction, upload validation | 20 |
| **Total** | | **81** |

**70% coverage gate** — if the codebase grows but tests do not keep pace, the build fails. Technical debt cannot accumulate silently.

---

## Part 8 — GCP Infrastructure Provisioning

A single script (`deploy_gcp.sh`) provisions the entire production infrastructure in 9 steps:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    deploy_gcp.sh — 9 Steps                          │
├──────┬──────────────────────────────┬────────────────────────────────┤
│ Step │ What it creates              │ Replaces                       │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  1   │ Enable 10 GCP APIs           │ Manual console clicking        │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  2   │ Artifact Registry repo       │ Docker Hub (public)           │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  3   │ Cloud SQL PostgreSQL         │ postgres container             │
│      │ auto-grow, daily backup,     │                               │
│      │ point-in-time recovery       │                               │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  4   │ Serverless VPC connector     │ (new — required for           │
│      │                              │  Memorystore access)          │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  5   │ Memorystore Redis 7          │ redis container               │
│      │ 5GB, VPC-internal            │                               │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  6   │ Pinecone index               │ ChromaDB container            │
│      │ dim=384, cosine, idempotent  │                               │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  7   │ Service account + 4 IAM roles│ Manual IAM management         │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  8   │ All secrets in Secret Manager│ .env files / hardcoded keys   │
├──────┼──────────────────────────────┼────────────────────────────────┤
│  9   │ Docker build → push →        │ Manual docker + gcloud cmds   │
│      │ Cloud Run deploy             │                               │
└──────┴──────────────────────────────┴────────────────────────────────┘
```

---

## Part 9 — Security Architecture

### Secrets — Never in Code or Images

```
API Keys (ANTHROPIC, PINECONE, LANGSMITH...)
      │
      ▼
Secret Manager (GCP)
      │
      ├── Cloud Run reads at container startup → env vars
      │   (secrets never baked into Docker image)
      │
      └── GKE reads via Workload Identity → K8s secrets
          (no key files on pods, no .env files)
```

### Authentication Flow

```
User                Next.js UI              FastAPI
  │                     │                      │
  ├── POST /login ──────►│                      │
  │                     ├── POST /api/auth/token►│
  │                     │                      ├── verify credentials
  │                     │                      ├── issue JWT (access + refresh)
  │                     │◄─── tokens ───────────┤
  │◄── session ─────────┤                      │
  │                     │                      │
  ├── POST /query ──────►│                      │
  │                     ├── Authorization: Bearer <token>──►│
  │                     │                      ├── validate JWT
  │                     │                      ├── route to RAG pipeline
  │◄── answer ──────────┤◄────────────────────-┤
```

Access tokens stored in JS memory (never localStorage — mitigates XSS token theft). Refresh tokens in sessionStorage. Auto-refresh on 401.

### Rate Limiting — Redis Backed, Fail-Open

```
Request arrives
      │
      ▼
Redis INCR bucket_key (60-second window)
      │
      ├── Count ≤ limit → allow request
      │
      ├── Count > limit → return 429 Too Many Requests
      │
      └── Redis unavailable → FAIL OPEN (allow request)
          (Redis outage does not block all traffic)
```

**Rate limits by endpoint:**

| Endpoint | Limit | Reason |
|---|---|---|
| `/api/query` | 30/min | LLM calls are expensive |
| `/api/ingest` | 10/min | Embedding + indexing is CPU-heavy |
| `/api/auth` | 20/min | Brute force protection |
| Default | 100/min | General protection |

---

## Part 10 — Summary: Why This Architecture

### The Compounding Advantages

Every component in this system was chosen not in isolation but because of how it interacts with the others:

```
Pinecone namespaces
      +
Cloud SQL per-tenant schema
      +
JWT with tenant claims
      ═══════════════════
True multi-tenant isolation — no data leakage possible between enterprise customers

Anthropic Claude (99.9% SLA)
      +
LangSmith tracing (cost + quality per call)
      +
4-role LLM pipeline (grade + verify every answer)
      ═══════════════════
Measurable, auditable AI quality — know exactly when and why answers are wrong

Cloud Run auto-scaling (1→100)
      +
Memorystore (consistent rate limit state across instances)
      +
Cloud SQL (4000 connections, connection pooling)
      ═══════════════════
Scales to enterprise load without any infrastructure management

Cloud Build test gate (70% coverage)
      +
COMMIT_SHA image tagging
      +
One-command rollback
      ═══════════════════
Deployments are safe, traceable, and reversible
```

### At a Glance — What This System Provides

| Capability | Before (Single VM) | After (Enterprise) |
|---|---|---|
| Max concurrent users | ~50 | 8,000+ (100 containers × 80 concurrency) |
| Vector DB capacity | RAM-limited (~100K docs) | Unlimited (Pinecone managed) |
| DB connections | ~100 | 4,000 (Cloud SQL) |
| LLM provider | 1 (Groq, hardcoded) | 3 (switchable via env var) |
| LLM SLA | None | 99.9% (Anthropic) |
| Tenant isolation | None | Complete (Pinecone namespace + DB schema) |
| Monitoring | None | Full (Prometheus + LangSmith) |
| Cost visibility | None | Per-query cost in LangSmith |
| Deployment | Manual | Automated on every git push |
| Rollback | Redeploy from scratch | One command (previous COMMIT_SHA) |
| UI | Streamlit (prototype) | Next.js 14 (production enterprise) |
| Auth | Basic | JWT + refresh + role-based views |

---

## Conclusion

The Universal RAG Agent Enterprise demonstrates that building a production AI system is not just about the AI — it is equally about the infrastructure, the operations, the security, and the developer workflow around it.

The 14 RAG patterns ensure every query gets the right retrieval strategy. The managed services ensure the system stays up under enterprise load. The LLM provider switching ensures cost-effective development without compromising production quality. LangSmith ensures that when something goes wrong — and in AI systems, things go wrong — you can see exactly why and fix it.

The migration from a single VM with five containers to a fully managed cloud-native platform is not optional for enterprise scale. It is the difference between a demo that works for 10 users and a platform that serves 10,000.

---

*Built with Anthropic Claude, LangSmith, LangChain, Pinecone, Next.js 14, FastAPI, Google Cloud Run, GKE, and Artifact Registry.*

*GitHub: [universal-rag-agent-enterprise](https://github.com/mshan011181/universal-rag-agent-enterprise)*
