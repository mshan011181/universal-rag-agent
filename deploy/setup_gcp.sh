#!/usr/bin/env bash
# deploy/setup_gcp.sh — One-shot Google Cloud setup for shan-project2
# Run once before the first Cloud Build / Cloud Run deployment.
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project shan-project2
#   All API keys / secrets ready (see .env for values)
#
# Usage:
#   chmod +x deploy/setup_gcp.sh
#   ./deploy/setup_gcp.sh
set -euo pipefail

PROJECT_ID="shan-project2"
REGION="us-central1"
REPO="rag-repo"
CLOUDSQL_INSTANCE="rag-postgres"
DB_NAME="ragdb"
DB_USER="raguser"
SA_NAME="rag-cloudrun-sa"

echo "=== Universal RAG Agent — GCP Setup for project: $PROJECT_ID ==="

# ── 1. Enable required APIs ───────────────────────────────────────────────────
echo "[1/8] Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. Artifact Registry repo ────────────────────────────────────────────────
echo "[2/8] Creating Artifact Registry repository..."
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Universal RAG Agent Docker images" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (repo already exists, skipping)"

# ── 3. Cloud SQL — PostgreSQL 15 ─────────────────────────────────────────────
echo "[3/8] Creating Cloud SQL instance (PostgreSQL 15)..."
gcloud sql instances create "$CLOUDSQL_INSTANCE" \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region="$REGION" \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --availability-type=zonal \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (instance already exists, skipping)"

echo "  Creating database $DB_NAME..."
gcloud sql databases create "$DB_NAME" \
  --instance="$CLOUDSQL_INSTANCE" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (database already exists)"

echo "  Creating user $DB_USER..."
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
gcloud sql users create "$DB_USER" \
  --instance="$CLOUDSQL_INSTANCE" \
  --password="$DB_PASSWORD" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (user already exists — password NOT reset)"

CLOUD_SQL_CONNECTION="${PROJECT_ID}:${REGION}:${CLOUDSQL_INSTANCE}"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION}"
echo "  DATABASE_URL (save this): $DATABASE_URL"

# ── 4. Service account ────────────────────────────────────────────────────────
echo "[4/8] Creating service account..."
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Universal RAG Cloud Run SA" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (service account already exists)"

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in \
  roles/cloudsql.client \
  roles/secretmanager.secretAccessor \
  roles/artifactregistry.reader \
  roles/run.invoker; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" --quiet
done

# Cloud Build SA — format changed in newer GCP projects.
# Must use project NUMBER (not project ID) to get the correct SA.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
# New format: service-{NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com
CLOUDBUILD_SA="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
# Legacy format as fallback: {NUMBER}@cloudbuild.gserviceaccount.com
CLOUDBUILD_SA_LEGACY="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "  Cloud Build SA (new format): $CLOUDBUILD_SA"
echo "  Triggering a dummy build to ensure Cloud Build SA is created..."
# The Cloud Build SA is only created after the API is enabled AND first build runs.
# We force-create it by describing the service (which initialises the SA).
gcloud builds submit --no-source --config /dev/stdin --project="$PROJECT_ID" <<'BUILDEOF' 2>/dev/null || true
steps:
- name: 'alpine'
  args: ['echo', 'preflight-init']
BUILDEOF

for CLOUDBUILD_MEMBER in \
  "serviceAccount:${CLOUDBUILD_SA}" \
  "serviceAccount:${CLOUDBUILD_SA_LEGACY}"; do
  for ROLE in \
    roles/run.admin \
    roles/iam.serviceAccountUser \
    roles/secretmanager.secretAccessor \
    roles/artifactregistry.writer; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="$CLOUDBUILD_MEMBER" \
      --role="$ROLE" --quiet 2>/dev/null || true
  done
done

# ── 5. Secret Manager secrets ─────────────────────────────────────────────────
echo "[5/8] Creating secrets in Secret Manager..."
echo "  >>> Please provide your secret values when prompted <<<"

_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo "  Updating secret: $name"
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"
  else
    echo "  Creating secret: $name"
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID"
  fi
}

# Auto-generated DATABASE_URL
_secret "database-url" "$DATABASE_URL"

# Read from .env or prompt
read_env() {
  local key="$1"
  local val
  val=$(grep "^${key}=" .env 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
  echo "$val"
}

_secret "jwt-secret"        "$(read_env JWT_SECRET)"
_secret "groq-api-key"      "$(read_env GROQ_API_KEY)"
_secret "pinecone-api-key"  "$(read_env PINECONE_API_KEY)"
_secret "anthropic-api-key" "$(read_env ANTHROPIC_API_KEY)"
_secret "resend-api-key"    "$(read_env RESEND_API_KEY)"
_secret "cohere-api-key"    "$(read_env COHERE_API_KEY)"
_secret "tavily-api-key"    "$(read_env TAVILY_API_KEY)"

# LangSmith (optional — use placeholder if not set)
LANGSMITH_KEY=$(read_env LANGSMITH_API_KEY)
_secret "langsmith-api-key" "${LANGSMITH_KEY:-placeholder}"

# ── 6. GCS bucket for build artifacts ────────────────────────────────────────
echo "[6/8] Creating GCS bucket for build artifacts..."
gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://${PROJECT_ID}-build-artifacts" 2>/dev/null || \
  echo "  (bucket already exists)"

# ── 7. Connect Cloud Build trigger to GitHub ─────────────────────────────────
echo "[7/8] Cloud Build GitHub trigger..."
echo "  To connect Cloud Build to GitHub:"
echo "  → https://console.cloud.google.com/cloud-build/triggers/connect?project=$PROJECT_ID"
echo "  → Connect repo: mshan011181/universal-rag-agent"
echo "  → Branch: ^main\$   Config: cloudbuild.yaml"
echo "  (skipping automatic creation — requires GitHub OAuth in browser)"

# ── 8. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=== SETUP COMPLETE ==="
echo "Project     : $PROJECT_ID"
echo "Region      : $REGION"
echo "Cloud SQL   : $CLOUD_SQL_CONNECTION"
echo "Database    : $DB_NAME"
echo "DB User     : $DB_USER"
echo "Service Acct: $SA_EMAIL"
echo "Artifact Reg: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
echo ""
echo "Next steps:"
echo "  1. Connect Cloud Build trigger (URL printed above)"
echo "  2. Push to main branch — Cloud Build will build + deploy automatically"
echo "  3. Backend URL:  https://rag-api-<hash>-uc.a.run.app"
echo "  4. Frontend URL: https://rag-frontend-<hash>-uc.a.run.app"
echo ""
echo "Useful commands:"
echo "  gcloud run services list --region=$REGION --project=$PROJECT_ID"
echo "  gcloud run services logs read rag-api --region=$REGION --project=$PROJECT_ID"
