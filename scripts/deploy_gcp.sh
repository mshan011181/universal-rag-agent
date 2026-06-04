#!/usr/bin/env bash
# =============================================================================
# deploy_gcp.sh — One-command BEFORE → AFTER managed-services migration
#
# What this provisions:
#   ✓ Artifact Registry repo
#   ✓ Cloud SQL PostgreSQL   (replaces postgres container)
#   ✓ Serverless VPC connector (required for Memorystore access)
#   ✓ Memorystore Redis      (replaces redis container)
#   ✓ Pinecone index         (replaces chromadb container)
#   ✓ Service account + IAM
#   ✓ Secret Manager secrets
#   ✓ Cloud Run — API + Frontend  (replaces VM containers)
#
# Prerequisites (run preflight_check.sh first):
#   - gcloud CLI installed and authenticated  (gcloud auth login)
#   - docker running
#   - PROJECT_ID exported
#   - REGION exported (defaults to us-central1)
#   - GCP billing enabled on the project
#   - Vertex AI Claude model enabled in GCP console
#
# Usage:
#   export PROJECT_ID=my-gcp-project
#   export REGION=us-central1        # optional, defaults below
#   bash scripts/deploy_gcp.sh
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:?ERROR: export PROJECT_ID=your-gcp-project before running}"
REGION="${REGION:-us-central1}"
DB_INSTANCE="rag-postgres"
DB_NAME="ragdb"
DB_USER="raguser"
REDIS_INSTANCE="rag-redis"
REDIS_TIER="BASIC"        # STANDARD_HA for production high-availability
REDIS_SIZE_GB=5
VPC_CONNECTOR="rag-vpc-connector"
VPC_NETWORK="default"
SA_NAME="rag-cloudrun-sa"
REPO="rag-repo"

# python binary (python3 on Linux/Mac, python on Windows Git Bash)
PY=$(command -v python3 2>/dev/null || command -v python)

echo "============================================================"
echo " Universal RAG Enterprise — GCP Deploy"
echo " Project : $PROJECT_ID"
echo " Region  : $REGION"
echo "============================================================"
echo ""

# ── Collect all API keys FIRST (before any step needs them) ───────────────────
echo "Enter API keys now (all are required):"
echo ""

_prompt_key() {
  local secret_name="$1" label="$2" value=""
  # Use value from environment if already exported
  value="${!secret_name:-}"
  if [ -n "$value" ]; then
    echo "  $label : (using exported \$$secret_name)"
  else
    read -r -s -p "  $label : " value
    echo ""
    if [ -z "$value" ]; then
      echo "  ERROR: $label is required." >&2
      exit 1
    fi
  fi
  # Export into current shell so subprocesses (python script) can read it
  export "$secret_name"="$value"
}

_prompt_key PINECONE_API_KEY   "PINECONE_API_KEY  "
_prompt_key ANTHROPIC_API_KEY  "ANTHROPIC_API_KEY "
_prompt_key LANGSMITH_API_KEY  "LANGSMITH_API_KEY "
_prompt_key GROQ_API_KEY       "GROQ_API_KEY      "
_prompt_key TAVILY_API_KEY     "TAVILY_API_KEY    "
_prompt_key COHERE_API_KEY     "COHERE_API_KEY    "

echo ""
echo "All keys collected. Starting provisioning..."
echo ""

# ── 1. Enable required APIs ───────────────────────────────────────────────────
echo "[1/9] Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  vpcaccess.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com \
  --project="$PROJECT_ID" \
  --quiet
echo "  Done."

# ── 2. Artifact Registry ──────────────────────────────────────────────────────
echo ""
echo "[2/9] Artifact Registry..."
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null && echo "  Created $REPO" || echo "  (already exists — skipping)"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── 3. Cloud SQL ──────────────────────────────────────────────────────────────
echo ""
echo "[3/9] Cloud SQL PostgreSQL (this takes ~5 minutes on first run)..."

# Check if the DB password secret already exists from a previous run.
# If yes, re-use it so DATABASE_URL stays consistent across re-runs.
if gcloud secrets describe "db-password" --project="$PROJECT_ID" --quiet &>/dev/null; then
  DB_PASS=$(gcloud secrets versions access latest --secret="db-password" --project="$PROJECT_ID")
  echo "  Re-using existing db-password from Secret Manager."
else
  DB_PASS=$("$PY" -c "import secrets; print(secrets.token_urlsafe(24))")
fi

if gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" --quiet &>/dev/null; then
  echo "  Instance $DB_INSTANCE already exists — skipping creation."
else
  gcloud sql instances create "$DB_INSTANCE" \
    --database-version=POSTGRES_16 \
    --tier=db-g1-small \
    --region="$REGION" \
    --storage-auto-increase \
    --backup-start-time=02:00 \
    --enable-point-in-time-recovery \
    --deletion-protection \
    --project="$PROJECT_ID" \
    --quiet
  echo "  Instance created."
fi

gcloud sql databases create "$DB_NAME" \
  --instance="$DB_INSTANCE" --project="$PROJECT_ID" --quiet 2>/dev/null \
  || echo "  Database $DB_NAME already exists."

# Always reset the password so it matches DB_PASS (idempotent)
gcloud sql users create "$DB_USER" \
  --instance="$DB_INSTANCE" --password="$DB_PASS" --project="$PROJECT_ID" --quiet 2>/dev/null \
  || gcloud sql users set-password "$DB_USER" \
       --instance="$DB_INSTANCE" --password="$DB_PASS" --project="$PROJECT_ID" --quiet

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
echo "  Connection: ${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

# ── 4. Serverless VPC Access connector (required for Memorystore) ─────────────
echo ""
echo "[4/9] Serverless VPC Access connector (needed for Memorystore)..."
if gcloud compute networks vpc-access connectors describe "$VPC_CONNECTOR" \
     --region="$REGION" --project="$PROJECT_ID" --quiet &>/dev/null; then
  echo "  Connector $VPC_CONNECTOR already exists — skipping."
else
  gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
    --region="$REGION" \
    --network="$VPC_NETWORK" \
    --range="10.8.0.0/28" \
    --min-instances=2 \
    --max-instances=10 \
    --machine-type=e2-micro \
    --project="$PROJECT_ID" \
    --quiet
  echo "  VPC connector created."
fi

# ── 5. Memorystore Redis ──────────────────────────────────────────────────────
echo ""
echo "[5/9] Memorystore Redis..."
if gcloud redis instances describe "$REDIS_INSTANCE" \
     --region="$REGION" --project="$PROJECT_ID" --quiet &>/dev/null; then
  echo "  Instance $REDIS_INSTANCE already exists — skipping creation."
else
  gcloud redis instances create "$REDIS_INSTANCE" \
    --size="$REDIS_SIZE_GB" \
    --region="$REGION" \
    --tier="$REDIS_TIER" \
    --redis-version=redis_7_0 \
    --network="projects/${PROJECT_ID}/global/networks/${VPC_NETWORK}" \
    --project="$PROJECT_ID" \
    --quiet
  echo "  Instance created."
fi

REDIS_IP=$(gcloud redis instances describe "$REDIS_INSTANCE" \
  --region="$REGION" --project="$PROJECT_ID" --format="value(host)")
REDIS_URL="redis://${REDIS_IP}:6379/0"
echo "  Memorystore private IP: $REDIS_IP"

# ── 6. Pinecone index (PINECONE_API_KEY already exported above) ───────────────
echo ""
echo "[6/9] Pinecone index..."
"$PY" scripts/create_pinecone_index.py

# ── 7. Service account + IAM ──────────────────────────────────────────────────
echo ""
echo "[7/9] Service account + IAM roles..."
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --display-name="RAG Cloud Run Service Account" \
  --project="$PROJECT_ID" --quiet 2>/dev/null \
  || echo "  Service account already exists."

for ROLE in \
  roles/aiplatform.user \
  roles/cloudsql.client \
  roles/secretmanager.secretAccessor \
  roles/vpcaccess.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" --quiet > /dev/null
done
echo "  $SA_EMAIL ready."

# ── 8. Secret Manager ─────────────────────────────────────────────────────────
echo ""
echo "[8/9] Storing secrets in Secret Manager..."

_upsert_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" --quiet &>/dev/null; then
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --data-file=- --project="$PROJECT_ID" --quiet
  else
    printf '%s' "$value" | gcloud secrets create "$name" \
      --data-file=- --replication-policy=automatic --project="$PROJECT_ID" --quiet
  fi
  echo "  secret/$name updated"
}

JWT_SECRET=$("$PY" -c "import secrets; print(secrets.token_hex(32))")
_upsert_secret "db-password"    "$DB_PASS"         # persisted so re-runs re-use same password
_upsert_secret "database-url"   "$DATABASE_URL"
_upsert_secret "redis-url"      "$REDIS_URL"
_upsert_secret "jwt-secret"     "$JWT_SECRET"
_upsert_secret "pinecone-api-key"   "$PINECONE_API_KEY"
_upsert_secret "anthropic-api-key"  "$ANTHROPIC_API_KEY"
_upsert_secret "langsmith-api-key"  "$LANGSMITH_API_KEY"
_upsert_secret "groq-api-key"       "$GROQ_API_KEY"
_upsert_secret "tavily-api-key"     "$TAVILY_API_KEY"
_upsert_secret "cohere-api-key"     "$COHERE_API_KEY"

# Grant Cloud Build SA access to secrets
CB_PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
CB_SA="${CB_PROJECT_NUM}@cloudbuild.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role=roles/secretmanager.secretAccessor --quiet > /dev/null
echo "  Cloud Build SA granted secret access."

# ── 9. Build images + deploy Cloud Run ───────────────────────────────────────
echo ""
echo "[9/9] Build Docker images and deploy to Cloud Run..."
IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "v1")
API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/rag-api:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/rag-frontend:${IMAGE_TAG}"

echo "  Building API image..."
docker build -f Dockerfile \
  -t "$API_IMAGE" -t "${API_IMAGE%:*}:latest" \
  --label "git.sha=${IMAGE_TAG}" .

echo "  Building Frontend image..."
docker build -f Dockerfile.streamlit \
  -t "$FRONTEND_IMAGE" -t "${FRONTEND_IMAGE%:*}:latest" \
  --label "git.sha=${IMAGE_TAG}" .

echo "  Pushing images..."
docker push --all-tags "${API_IMAGE%:*}"
docker push --all-tags "${FRONTEND_IMAGE%:*}"

COMMON_ENV="LLM_PROVIDER=anthropic,ANTHROPIC_MODEL=claude-sonnet-4-5,LANGCHAIN_TRACING_V2=true,LANGCHAIN_PROJECT=universal-rag-enterprise,LANGCHAIN_ENDPOINT=https://api.smith.langchain.com,PINECONE_INDEX_NAME=universal-rag,ENVIRONMENT=production"
COMMON_SECRETS="PINECONE_API_KEY=pinecone-api-key:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,LANGCHAIN_API_KEY=langsmith-api-key:latest,GROQ_API_KEY=groq-api-key:latest,TAVILY_API_KEY=tavily-api-key:latest,COHERE_API_KEY=cohere-api-key:latest"

echo "  Deploying API to Cloud Run..."
gcloud run deploy rag-api \
  --image="$API_IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  --set-env-vars="$COMMON_ENV" \
  --set-secrets="${COMMON_SECRETS},DATABASE_URL=database-url:latest,REDIS_URL=redis-url:latest,JWT_SECRET=jwt-secret:latest" \
  --add-cloudsql-instances="${PROJECT_ID}:${REGION}:${DB_INSTANCE}" \
  --vpc-connector="$VPC_CONNECTOR" \
  --vpc-egress=private-ranges-only \
  --min-instances=1 \
  --max-instances=100 \
  --concurrency=80 \
  --memory=4Gi \
  --cpu=2 \
  --project="$PROJECT_ID" \
  --quiet

echo "  Deploying Frontend to Cloud Run..."
gcloud run deploy rag-frontend \
  --image="$FRONTEND_IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  --set-env-vars="$COMMON_ENV" \
  --set-secrets="$COMMON_SECRETS" \
  --vpc-connector="$VPC_CONNECTOR" \
  --vpc-egress=private-ranges-only \
  --min-instances=1 \
  --max-instances=100 \
  --concurrency=20 \
  --memory=4Gi \
  --cpu=2 \
  --project="$PROJECT_ID" \
  --quiet

# ── Print URLs ─────────────────────────────────────────────────────────────────
API_URL=$(gcloud run services describe rag-api \
  --region="$REGION" --project="$PROJECT_ID" --format="value(status.url)")
FRONTEND_URL=$(gcloud run services describe rag-frontend \
  --region="$REGION" --project="$PROJECT_ID" --format="value(status.url)")

echo ""
echo "============================================================"
echo " Deployment complete — AFTER (managed services)"
echo "============================================================"
echo ""
echo "  API      : $API_URL"
echo "  Frontend : $FRONTEND_URL"
echo "  Vector DB: Pinecone  (index: universal-rag)"
echo "  DB       : Cloud SQL ${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
echo "  Cache    : Memorystore ${REDIS_IP}:6379 (via VPC connector)"
echo "  LLM      : Vertex AI Claude (claude-sonnet-4-5)"
echo ""
echo "  REQUIRED NEXT STEP — run the DB schema:"
echo "    gcloud sql connect $DB_INSTANCE --user=$DB_USER --database=$DB_NAME \\"
echo "      --project=$PROJECT_ID"
echo "    -- then paste the contents of infra/postgres/init.sql"
echo ""
echo "  To run the build+test pipeline before future deploys:"
echo "    bash scripts/build_and_test.sh"
echo "============================================================"
