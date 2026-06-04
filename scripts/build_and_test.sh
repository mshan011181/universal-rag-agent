#!/usr/bin/env bash
# =============================================================================
# build_and_test.sh — Local build pipeline
#
# Stages (each must pass before the next runs):
#   1. Lint        — ruff (style + imports)
#   2. Type check  — mypy (static analysis)
#   3. Security    — bandit (SAST scan)
#   4. Unit tests  — pytest with coverage gate (70 %)
#   5. Build API   — docker build Dockerfile
#   6. Build UI    — docker build Dockerfile.streamlit
#   7. Smoke test  — start API container, hit /api/health, stop container
#
# If any stage fails the script exits immediately and skips remaining stages.
# Docker images are only produced after all tests pass.
#
# Usage:
#   bash scripts/build_and_test.sh              # full pipeline
#   bash scripts/build_and_test.sh --skip-lint  # skip lint+type+security
# =============================================================================
set -euo pipefail

SKIP_LINT=false
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'local')}"
API_IMAGE="rag-api:${TAG}"
FRONTEND_IMAGE="rag-frontend:${TAG}"

for arg in "$@"; do
  [[ "$arg" == "--skip-lint" ]] && SKIP_LINT=true
done

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
step() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Universal RAG Enterprise — Build & Test Pipeline       ║"
echo "║   Image tag: ${TAG}"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Activate venv if present ───────────────────────────────────────────────────
if [ -f ".venv/Scripts/activate" ]; then
  source .venv/Scripts/activate
elif [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
fi

# ── Install dev dependencies if needed ────────────────────────────────────────
if ! python -c "import pytest" 2>/dev/null; then
  step "Installing dev dependencies"
  pip install -q -r requirements-dev.txt -r requirements-api.txt
fi

# ── Stage 1: Lint ─────────────────────────────────────────────────────────────
if [ "$SKIP_LINT" = false ]; then
  step "Stage 1/7 — Lint (ruff)"
  ruff check src/ api/ tests/ || fail "Lint failed — fix errors above then re-run"
  pass "Lint passed"

  # ── Stage 2: Type check ───────────────────────────────────────────────────────
  step "Stage 2/7 — Type check (mypy)"
  mypy src/ api/ --ignore-missing-imports --no-error-summary || fail "Type check failed"
  pass "Type check passed"

  # ── Stage 3: Security scan ────────────────────────────────────────────────────
  step "Stage 3/7 — Security scan (bandit)"
  bandit -r src/ api/ -ll -q || fail "Security scan found high-severity issues"
  pass "Security scan passed"
else
  echo -e "${YELLOW}Skipping stages 1-3 (--skip-lint)${NC}"
fi

# ── Stage 4: Tests ────────────────────────────────────────────────────────────
step "Stage 4/7 — Unit + integration tests (pytest)"
pytest \
  --tb=short \
  --cov=src \
  --cov=api \
  --cov-report=term-missing \
  --cov-report=xml:coverage.xml \
  --cov-fail-under=70 \
  -q \
  || fail "Tests failed — fix failures before building images"
pass "All tests passed"

# ── Stage 5: Build API image ──────────────────────────────────────────────────
step "Stage 5/7 — Build API Docker image"
docker build \
  -f Dockerfile \
  -t "$API_IMAGE" \
  -t "rag-api:latest" \
  --label "git.sha=${TAG}" \
  --label "built.by=build_and_test.sh" \
  . \
  || fail "API Docker build failed"
pass "API image built → ${API_IMAGE}"

# ── Stage 6: Build Frontend image ─────────────────────────────────────────────
step "Stage 6/7 — Build Frontend Docker image"
docker build \
  -f Dockerfile.streamlit \
  -t "$FRONTEND_IMAGE" \
  -t "rag-frontend:latest" \
  --label "git.sha=${TAG}" \
  --label "built.by=build_and_test.sh" \
  . \
  || fail "Frontend Docker build failed"
pass "Frontend image built → ${FRONTEND_IMAGE}"

# ── Stage 7: Smoke test API container ─────────────────────────────────────────
step "Stage 7/7 — Smoke test API container"
CONTAINER_NAME="rag-smoke-$$"

docker run -d \
  --name "$CONTAINER_NAME" \
  -p 18000:8000 \
  -e GROQ_API_KEY="${GROQ_API_KEY:-test-key}" \
  -e JWT_SECRET="${JWT_SECRET:-test-secret}" \
  -e PINECONE_API_KEY="${PINECONE_API_KEY:-test-pinecone-key}" \
  -e PINECONE_INDEX_NAME="${PINECONE_INDEX_NAME:-test-index}" \
  -e LLM_PROVIDER=groq \
  -e ENVIRONMENT=test \
  "$API_IMAGE" > /dev/null

# Wait for container to be ready
echo "  Waiting for API to start..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:18000/api/health > /dev/null 2>&1; then
    break
  fi
  sleep 2
  if [ "$i" -eq 20 ]; then
    docker logs "$CONTAINER_NAME"
    docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1 || true
    fail "API container did not start within 40 seconds"
  fi
done

HEALTH=$(curl -sf http://localhost:18000/api/health)
docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1

if echo "$HEALTH" | grep -q '"status":"ok"'; then
  pass "Smoke test passed — API container healthy"
else
  fail "Smoke test failed — unexpected health response: $HEALTH"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Build pipeline PASSED                                  ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Images ready:                                          ║"
echo "║     ${API_IMAGE}"
echo "║     ${FRONTEND_IMAGE}"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Next steps:                                            ║"
echo "║     Push to registry:                                    ║"
echo "║       docker tag rag-api:${TAG} REGISTRY/rag-api:${TAG}"
echo "║       docker push REGISTRY/rag-api:${TAG}"
echo "║     Or run locally:                                      ║"
echo "║       docker-compose up                                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
