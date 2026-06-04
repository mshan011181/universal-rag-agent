#!/usr/bin/env bash
# Pre-flight check — only command -v lookups and env var reads. No processes spawned.
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Universal RAG Enterprise — Pre-flight Check            ║"
echo "╚══════════════════════════════════════════════════════════╝"

echo -e "\n${YELLOW}── Tools ──${NC}"
command -v gcloud &>/dev/null && ok "gcloud CLI found" || fail "gcloud not found — install Cloud SDK"
command -v docker  &>/dev/null && ok "docker found"    || fail "docker not found — install Docker Desktop"
command -v git     &>/dev/null && ok "git found"       || fail "git not found"
{ command -v python3 &>/dev/null || command -v python &>/dev/null; } \
  && ok "python found" || fail "python not found — install Python 3.10+"

echo -e "\n${YELLOW}── Working directory ──${NC}"
if [ -f "scripts/deploy_gcp.sh" ] && [ -f "Dockerfile" ]; then
  ok "repo root: $(pwd)"
else
  fail "not in repo root — cd to universal_rag_agent_enterprise first"
fi

echo -e "\n${YELLOW}── Environment variables ──${NC}"
[ -n "${PROJECT_ID:-}" ] && ok "PROJECT_ID=$PROJECT_ID" \
  || fail "PROJECT_ID not set — export PROJECT_ID=your-gcp-project-id"
[ -n "${REGION:-}" ] && ok "REGION=$REGION" \
  || warn "REGION not set — will default to us-central1"

echo -e "\n${YELLOW}── API keys (deploy_gcp.sh prompts for any that are missing) ──${NC}"
for KEY in PINECONE_API_KEY GROQ_API_KEY TAVILY_API_KEY COHERE_API_KEY; do
  [ -n "${!KEY:-}" ] && ok "$KEY exported" || warn "$KEY not exported — will be prompted"
done

echo -e "\n${YELLOW}── GCP credentials (local file only) ──${NC}"
# Check all known ADC locations (Linux, Mac, Windows native, Windows Git Bash)
ADC_FOUND=false
for ADC_PATH in \
  "$HOME/.config/gcloud/application_default_credentials.json" \
  "$APPDATA/gcloud/application_default_credentials.json" \
  "$LOCALAPPDATA/gcloud/application_default_credentials.json" \
  "/c/Users/$USERNAME/AppData/Roaming/gcloud/application_default_credentials.json" \
  "${CLOUDSDK_CONFIG:-__none__}/application_default_credentials.json"; do
  if [ -f "$ADC_PATH" ]; then
    ok "ADC credentials found: $ADC_PATH"
    ADC_FOUND=true
    break
  fi
done
if [ "$ADC_FOUND" = false ]; then
  fail "ADC missing — run: gcloud auth application-default login"
fi

echo -e "\n${YELLOW}── Reminder ──${NC}"
warn "Enable Vertex AI Claude before deploying:"
warn "  console.cloud.google.com/vertex-ai/model-garden → search Claude → Enable"

echo ""
echo "────────────────────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}$PASS checks passed. Ready to deploy.${NC}"
  echo "  export PROJECT_ID=${PROJECT_ID:-your-project-id}"
  echo "  bash scripts/deploy_gcp.sh"
else
  echo -e "${RED}$FAIL failed, $PASS passed — fix above then re-run.${NC}"
fi
echo "────────────────────────────────────────────────────────────"
