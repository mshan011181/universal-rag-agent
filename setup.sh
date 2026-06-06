#!/usr/bin/env bash
# =============================================================================
# setup.sh — One-command local dev setup for Universal RAG Enterprise
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓  $1${NC}"; }
info() { echo -e "${YELLOW}  →  $1${NC}"; }
fail() { echo -e "${RED}  ✗  $1${NC}"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Universal RAG Enterprise — Local Dev Setup             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Guard: must be run from repo root ─────────────────────────────────────────
if [ ! -f "Dockerfile" ] || [ ! -f "requirements-api.txt" ]; then
  fail "Run this script from the repo root: cd universal_rag_agent_enterprise && bash setup.sh"
fi

# ── Step 1: Create a fresh .venv in THIS directory ────────────────────────────
info "Step 1/5 — Creating virtual environment in $(pwd)/.venv ..."

# Deactivate any currently active venv to avoid cross-project contamination
if [ -n "${VIRTUAL_ENV:-}" ]; then
  info "Deactivating existing venv: $VIRTUAL_ENV"
  deactivate 2>/dev/null || true
fi

# Remove stale .venv if it points to a different project
if [ -d ".venv" ]; then
  EXISTING_PYTHON=$(cat .venv/Scripts/python.exe 2>/dev/null || echo "")
  info "Removing existing .venv to ensure clean setup..."
  rm -rf .venv
fi

# Detect python binary
PY=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || fail "Python not found — install Python 3.10+")
info "Using Python: $PY ($($PY --version))"

# Create venv explicitly in current directory
"$PY" -m venv .venv
ok "Virtual environment created at: $(pwd)/.venv"

# ── Step 2: Activate and upgrade pip ──────────────────────────────────────────
info "Step 2/5 — Activating venv and upgrading pip..."

# Activate (Windows Git Bash path)
if [ -f ".venv/Scripts/activate" ]; then
  source .venv/Scripts/activate
elif [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
else
  fail "Could not find activate script in .venv"
fi

# Confirm we are using the right python
ACTIVE_PY=$(which python)
if [[ "$ACTIVE_PY" != *"universal_rag_agent_enterprise"* ]]; then
  fail "Wrong Python active: $ACTIVE_PY — expected one inside this project's .venv"
fi

ok "Active Python: $ACTIVE_PY"
python -m pip install --upgrade pip --quiet
ok "pip upgraded"

# ── Step 3: Install dependencies ──────────────────────────────────────────────
info "Step 3/5 — Installing Python dependencies..."
pip install -q -r requirements-api.txt
pip install -q -r requirements-dev.txt
ok "Python dependencies installed"

# ── Step 4: Copy .env template ────────────────────────────────────────────────
info "Step 4/5 — Setting up environment variables..."

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    ok "Created .env from .env.example — fill in your API keys"
  else
    # Create a minimal .env if no example exists
    cat > .env <<'ENVEOF'
# ── LLM ────────────────────────────────────────────────────────────────────
LLM_PROVIDER=groq
GROQ_API_KEY=                    # required — get from console.groq.com

# Production LLM (set LLM_PROVIDER=anthropic when ready)
ANTHROPIC_API_KEY=               # get from console.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-5

# ── Monitoring ──────────────────────────────────────────────────────────────
LANGSMITH_API_KEY=               # get from smith.langchain.com
LANGSMITH_PROJECT=universal-rag-enterprise

# ── Vector DB ───────────────────────────────────────────────────────────────
PINECONE_API_KEY=                # required — get from app.pinecone.io
PINECONE_INDEX_NAME=universal-rag

# ── Optional ────────────────────────────────────────────────────────────────
TAVILY_API_KEY=                  # web search fallback (CRAG pattern)
COHERE_API_KEY=                  # cross-encoder reranking

# ── Auto-set by deploy_gcp.sh in production ─────────────────────────────────
# DATABASE_URL=
# REDIS_URL=
# JWT_SECRET=
ENVEOF
    ok "Created .env — fill in your API keys"
  fi
else
  ok ".env already exists — skipping"
fi

# ── Step 5: Create Pinecone index ─────────────────────────────────────────────
info "Step 5/5 — Creating Pinecone index (skipped if PINECONE_API_KEY not set)..."

# Load .env so the script can read PINECONE_API_KEY
set -a; source .env 2>/dev/null || true; set +a

if [ -z "${PINECONE_API_KEY:-}" ]; then
  echo -e "${YELLOW}  !  PINECONE_API_KEY not set — skipping index creation.${NC}"
  echo -e "${YELLOW}     Add it to .env and run: python scripts/create_pinecone_index.py${NC}"
else
  python scripts/create_pinecone_index.py && ok "Pinecone index ready" || \
    echo -e "${YELLOW}  !  Pinecone index creation failed — check your PINECONE_API_KEY${NC}"
fi

# ── Install frontend dependencies ─────────────────────────────────────────────
if command -v npm &>/dev/null && [ -f "frontend/package.json" ]; then
  info "Installing Next.js frontend dependencies..."
  (cd frontend && npm install --silent)
  ok "Frontend dependencies installed"
else
  echo -e "${YELLOW}  !  npm not found or frontend/package.json missing — skipping frontend setup${NC}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Setup complete — next steps                            ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  1. Edit .env and add your API keys:                     ║"
echo "║       GROQ_API_KEY     → console.groq.com                ║"
echo "║       PINECONE_API_KEY → app.pinecone.io                 ║"
echo "║                                                          ║"
echo "║  2. Activate the venv:                                   ║"
echo "║       source .venv/Scripts/activate  (Windows Git Bash)  ║"
echo "║       source .venv/bin/activate      (Mac / Linux)       ║"
echo "║                                                          ║"
echo "║  3. Start the API (Terminal 1):                          ║"
echo "║       uvicorn api.main:app --reload --port 8000          ║"
echo "║                                                          ║"
echo "║  4. Start the UI (Terminal 2):                           ║"
echo "║       cd frontend && npm run dev                         ║"
echo "║       Open: http://localhost:3000                        ║"
echo "║                                                          ║"
echo "║  Or run everything with Docker:                          ║"
echo "║       docker-compose up -d --build                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
