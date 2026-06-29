# MaximAI (Universal RAG Enterprise) — Issues Fixed & Features Added

A running log of problems diagnosed and fixed, and features built, with root
causes and the commits that resolved them. Most recent at the bottom of each
section. (Repo: `mshan011181/universal-rag-agent-enterprise`.)

---

## 1. Figures / diagrams in answers

### 1.1 Figures not appearing in answers
- **Symptom:** STEM documents had figures, but answers never showed them.
- **Root cause:** Marker-extracted figures were associated at the wrong granularity, so they didn't surface with the relevant chunk.
- **Fix:** Associate figures at the **section level** so they appear whenever the section is retrieved. `f568a0b`, `9881337`

### 1.2 Broken figure image links (403/404)
- **Symptom:** Figure thumbnails rendered as broken-image icons.
- **Root cause #1 — signing:** Cloud Run has no private key, so plain signed-URL generation failed. **Fix:** sign via the IAM **SignBlob** API (same method as media uploads). `bc20865`
- **Root cause #2 — stale references:** chunks for `stem_content.pdf` pointed at figure objects that were no longer in the bucket → signed URLs 404'd. **Fix:** `sign_figure_urls()` now **skips objects that don't exist** (no broken icons), and document **deletion now removes the figures folder** too. `f30e73a`

### 1.3 Global figure lifecycle
- **Requirement:** deleting a document must remove its diagrams/figures and cached chunks; each document's figures must live in its own folder (no hardcoding), for any modality.
- **Fix:** single `figure_prefix_for_source()` used by both ingest and delete; `delete_figures_by_source()` wired into the delete endpoint (removes vectors + cache + figures). `f30e73a`

---

## 2. Retrieval quality

### 2.1 Reranking precision
- **Added:** always-on **Cohere cross-encoder rerank** as a final precision pass over hybrid (dense + BM25) results. `260f3c8`

### 2.2 Answers losing detail (over-trimming)
- **Symptom:** answers dropped formulas, steps, and detail.
- **Root cause:** per-chunk sentence compression trimmed content before the LLM saw it.
- **Fix:** send **full retrieved chunks** to the LLM (no trimming), for all document types. `d2fc297`

### 2.3 Cross-document context mixing
- **Symptom:** a maths question pulled physics content and answered from it.
- **Root cause:** the relevance filter **always force-fed the top-3 chunks** even when nothing cleared the threshold → unrelated docs leaked in.
- **Fix:** **abstain** when nothing is genuinely relevant (keep only chunks above an abstain floor; otherwise return no context so the model says "no relevant information"). Global, modality-agnostic. `328ceb9`

### 2.4 Scanned / image PDFs giving wrong answers
- **Symptom:** image-based/scanned PDFs returned incorrect results (text PDFs were fine).
- **Root cause:** the auto-detection that routed scanned/STEM PDFs to Marker became dead code when Marker moved to a manual GPU Job; those PDFs fell back to the weak pdfplumber path.
- **Fix:** **auto-route** scanned/image/STEM PDFs to the Marker Job at ingest (cheap `_is_stem_pdf` check). `111c786`

---

## 3. Copy / export of answers

- **LaTeX → Unicode** copy/download converter made comprehensive & general. `b22e2f4`
- Stopped **KaTeX duplicating equations** on native copy-paste. `d08342e`
- **Copy button** writes rich HTML + clean plain text (Word-friendly). `b24799b`
- **Podcast (MP3) download** of a Q&A via Google Cloud TTS (REST, no new dep). `46aec11`
- **PowerPoint (.pptx) slides** of an answer (python-pptx). `55d0086`
- **Evaluation report → PDF** download (fpdf2). `55d0086`; fixed for fpdf2 2.8 API (`ln=` removed; explicit page width). `bde2c36`

---

## 4. Cost & infrastructure

### 4.1 Cloud Run cost (scale-to-zero)
- **Symptom:** ~₹4,000/mo Cloud Run cost.
- **Root cause:** `rag-api` ran at `min-instances=1` with `--no-cpu-throttling` (2 vCPU billed 24/7).
- **Fix:** pin **`min-instances=0`** (scale to zero when idle) in `cloudbuild.yaml` + live; kept `--no-cpu-throttling` only for background ingestion. `82f3640`

### 4.2 Slow cold starts (History/Dashboard took minutes)
- **Root cause:** `sentence-transformers`/torch imported at module load → every cold start paid the torch import, even for non-embedding pages.
- **Fix:** **lazy-import** the embedder so lightweight pages cold-start in seconds. `fbb2c57` (+ test fix `b21295e`)

### 4.3 Default model cost
- **Symptom:** default queries silently used paid Claude Sonnet 4-5.
- **Fix:** default `LLM_PROVIDER=groq` (free Llama 3.3 70B); Claude only when explicitly selected. `a83d4c0`
- **Added** Gemini 2.5 Flash / Flash-Lite (Vertex) as cheaper selectable models. `e95d3a7`, `1d6c618`

### 4.4 Vector DB migration: Pinecone → pgvector
- **Driver:** Pinecone trial expiry + cost/vendor risk.
- **Fix:** added a **pgvector** backend on the existing Cloud SQL Postgres behind a `VECTOR_BACKEND` switch; one-time lossless migration (Admin → "Migrate vectors → pgvector"); flipped live + persisted `VECTOR_BACKEND=pgvector`. ~12,269 vectors migrated. `f623dc6`, `80a0502`, `bde2c36`
- **Status:** live on pgvector; Pinecone kept **dormant** as a safety net (removal pending final validation).

### 4.5 Model/cost badge inconsistency
- **Symptom:** answer showed "Claude" at top but "Free (Groq)" cost.
- **Root cause:** badge reported the *requested* model; cost table missing `claude-sonnet-4-5`; "Free (Groq)" hardcoded.
- **Fix:** report the model that **actually** answered (reflects fallbacks); add `claude-sonnet-4-5` pricing; label "Free". `16e922b`, `98ac11f`

---

## 5. Auth, session & UX

- **In-progress query/evaluation lost on navigation** → persisted via a module-level session store (survives route changes). `4afbe91`
- **Premature logout on idle / F5 → login** → `refreshToken()` now **retries cold-start failures** (only logs out on a real 401/403). `ca13d05`
- **First login after idle failed** (cold start) → `login()` retries transient failures. `fd9f7df`
- **Sidebar/logout scrolled with content** → fixed-height layout; only the work area scrolls. `ca13d05`
- **Model-aware cache + "Force fresh" + "New query"** → selecting a model no longer returns a cached other-model answer; bypass/reset controls added. `ca13d05`
- **Cancel buttons** for in-progress **query** and **ingestion**. `bb227b3`, `46aec11`
- **Team page "Failed to fetch"** → invite/remove crashed with `KeyError: 'email'` (JWT lacks email); resolve email from DB. `66d7b3e`

---

## 6. Branding & content

- **Rebrand** "Universal RAG / Enterprise" → **MaximAI — "your data, distilled into answers"** across sidebar, titles, auth pages. `59149b6`
- Sidebar "Home" → **"Ask Your Data"**; removed stat cards; full-width query page; Models & Patterns moved to Dashboard. `59149b6`, `0e41633`
- **Any-file multi-question** upload (PDF/DOCX/TXT/CSV/image), not image-only. `59149b6`
- **Supported data-type chips** under the heading; subtitle "indexed documents" → "indexed data". `b794f2b`
- **Indian English** added to Answer Language. `98ac11f`
- **Bilingual (English + Tamil)** audio/video/YouTube: auto-detect + English translation appended for non-English. `bb227b3`

---

## 7. Answer Evaluation (new feature)

- **New page:** upload Questions + Answers files → graded against ingested docs → score /100 + per-question report (mistakes, corrections, feedback). Source filter included. `2809138`
- **MCQ fix:** options (a/b/c/d) were treated as separate questions → bundle each question's options together (prompt + parser safety net). `fd9f7df`
- **Evaluation quality (per ChatGPT feedback):** question-aware grading, structured rubric, careful numerics, sign/magnitude leniency. `debd7b0`
- **Meaning-based grading:** full credit for correct answers in the student's own words; never penalise wording. `e6c19c3`
- **Model selection + metrics:** model dropdown (same list as Ask Your Data) drives the reference answer and grading; report (on-screen + PDF) now shows **token usage** and **evaluation accuracy** (avg grounding of reference answers). `2d8149f`

---

## 8. Subscriptions & accounts (new)

- **Phase 1 — Free trial limit:** lifetime free questions per user (initially 5, **raised to 10**); **owner allowlist** (`OWNER_EMAILS`) for unlimited (you + co-owner). Metered across query, image-batch, and evaluation. `3d6f5d4`
- **Phase 2 — Plan & Usage page** + pricing UI (Free/Monthly/Quarterly/Yearly). `74d2bdb`
- **Phase 3 — Razorpay payments (USD):** create-order → verify → auto plan upgrade; webhook backup; plan stored on `users`. `fe3f057`
- **Public landing + pricing at root**, plan-aware signup (free → app; paid → checkout), plan shown in sidebar, **self-service account deletion** (Danger zone). `66d9ef6`, `b61741a`

---

## Current state (snapshot)

- **Vector store:** pgvector (Cloud SQL Postgres) — live + persisted. Pinecone dormant.
- **Default LLM:** Groq Llama 3.3 70B (free). Selectable: Claude Sonnet/Haiku, Gemini 2.5 Flash / Flash-Lite.
- **Embeddings:** local MiniLM (free). **Rerank:** Cohere.
- **Cloud Run:** `min-instances=0` (scale to zero). **Owners:** krishgopalpatu@, shandba92@ (unlimited).
- **Pending cleanup:** remove Pinecone code/dependency after final pgvector validation.
- **On hold:** free SMTP (Gmail) OTP email (uncommitted).
