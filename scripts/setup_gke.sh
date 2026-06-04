#!/usr/bin/env bash
# =============================================================================
# setup_gke.sh — Build images → push to Artifact Registry → deploy to GKE
#
# What this does:
#   1. Builds API + Frontend Docker images locally
#   2. Tags and pushes them to GCP Artifact Registry (NOT Docker Hub)
#   3. Creates a GKE Autopilot cluster (no node pool management needed)
#   4. Configures Workload Identity so pods reach Cloud SQL / Vertex AI
#   5. Populates the rag-secrets K8s Secret from GCP Secret Manager
#   6. Applies infra/k8s/deployment.yml (Deployments + Services + HPAs)
#
# Prerequisites:
#   - deploy_gcp.sh already ran (Artifact Registry repo, Secret Manager,
#     Cloud SQL, Memorystore, service account all exist)
#   - PROJECT_ID exported
#   - Docker running and authenticated to Artifact Registry
#
# Usage:
#   export PROJECT_ID=my-gcp-project
#   export REGION=us-central1          # optional, defaults below
#   bash scripts/setup_gke.sh
# =============================================================================
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?ERROR: export PROJECT_ID=your-gcp-project}"
REGION="${REGION:-us-central1}"
CLUSTER="rag-cluster"
REPO="rag-repo"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
SA_NAME="rag-cloudrun-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "v1")
K8S_SA="rag-workload-sa"
NAMESPACE="rag-agent"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
step() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Universal RAG Enterprise — GKE Setup                   ║"
echo "║   Project : ${PROJECT_ID}"
echo "║   Region  : ${REGION}"
echo "║   Tag     : ${IMAGE_TAG}"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Step 1: Authenticate Docker to Artifact Registry ─────────────────────────
step "1/8 — Authenticate Docker to Artifact Registry"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
ok "Docker → Artifact Registry auth configured"

# ── Step 2: Build images ──────────────────────────────────────────────────────
step "2/8 — Build Docker images"

API_IMAGE="${REGISTRY}/rag-api:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGISTRY}/rag-frontend:${IMAGE_TAG}"

echo "  Building API image..."
docker build -f Dockerfile \
  -t "${API_IMAGE}" \
  -t "${REGISTRY}/rag-api:latest" \
  --label "git.sha=${IMAGE_TAG}" \
  .
ok "API image built → ${API_IMAGE}"

echo "  Building Frontend image..."
docker build -f Dockerfile.streamlit \
  -t "${FRONTEND_IMAGE}" \
  -t "${REGISTRY}/rag-frontend:latest" \
  --label "git.sha=${IMAGE_TAG}" \
  .
ok "Frontend image built → ${FRONTEND_IMAGE}"

# ── Step 3: Push to Artifact Registry ────────────────────────────────────────
step "3/8 — Push images to Artifact Registry (not Docker Hub)"
docker push --all-tags "${REGISTRY}/rag-api"
ok "API image pushed to ${REGISTRY}/rag-api"

docker push --all-tags "${REGISTRY}/rag-frontend"
ok "Frontend image pushed to ${REGISTRY}/rag-frontend"

# ── Step 4: Create GKE Autopilot cluster ─────────────────────────────────────
step "4/8 — GKE Autopilot cluster"
gcloud services enable container.googleapis.com --project="$PROJECT_ID" --quiet

if gcloud container clusters describe "$CLUSTER" \
     --region="$REGION" --project="$PROJECT_ID" --quiet &>/dev/null; then
  echo "  Cluster $CLUSTER already exists — skipping creation."
else
  echo "  Creating GKE Autopilot cluster (this takes ~5 minutes)..."
  gcloud container clusters create-auto "$CLUSTER" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --quiet
  ok "Cluster created."
fi

# Get credentials so kubectl works
gcloud container clusters get-credentials "$CLUSTER" \
  --region="$REGION" --project="$PROJECT_ID" --quiet
ok "kubectl context set to $CLUSTER"

# ── Step 5: Workload Identity binding ─────────────────────────────────────────
# Allows pods using K8s SA rag-workload-sa to act as GCP SA rag-cloudrun-sa.
# This gives pods access to: Cloud SQL, Secret Manager, Vertex AI — no key files.
step "5/8 — Workload Identity"

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

kubectl create serviceaccount "$K8S_SA" \
  --namespace="$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

# Annotate K8s SA to link to GCP SA
kubectl annotate serviceaccount "$K8S_SA" \
  --namespace="$NAMESPACE" \
  "iam.gke.io/gcp-service-account=${SA_EMAIL}" \
  --overwrite

# Allow GCP SA to be impersonated by K8s SA
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[${NAMESPACE}/${K8S_SA}]" \
  --project="$PROJECT_ID" --quiet > /dev/null

ok "Workload Identity: ${NAMESPACE}/${K8S_SA} → ${SA_EMAIL}"

# ── Step 6: Grant Artifact Registry pull access to the cluster ────────────────
step "6/8 — Artifact Registry pull access"
# GKE Autopilot uses the default compute SA for image pulls.
COMPUTE_SA=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role=roles/artifactregistry.reader \
  --quiet > /dev/null
ok "Compute SA granted Artifact Registry reader"

# ── Step 7: Populate K8s Secret from Secret Manager ──────────────────────────
step "7/8 — Populate rag-secrets from GCP Secret Manager"

_sm() { gcloud secrets versions access latest --secret="$1" --project="$PROJECT_ID" 2>/dev/null || echo ""; }

kubectl create secret generic rag-secrets \
  --namespace="$NAMESPACE" \
  --from-literal=anthropic-api-key="$(_sm anthropic-api-key)" \
  --from-literal=langsmith-api-key="$(_sm langsmith-api-key)" \
  --from-literal=pinecone-api-key="$(_sm pinecone-api-key)" \
  --from-literal=database-url="$(_sm database-url)" \
  --from-literal=redis-url="$(_sm redis-url)" \
  --from-literal=jwt-secret="$(_sm jwt-secret)" \
  --from-literal=groq-api-key="$(_sm groq-api-key)" \
  --from-literal=tavily-api-key="$(_sm tavily-api-key)" \
  --from-literal=cohere-api-key="$(_sm cohere-api-key)" \
  --dry-run=client -o yaml | kubectl apply -f -

ok "rag-secrets populated in namespace $NAMESPACE"

# ── Step 8: Apply K8s manifests ───────────────────────────────────────────────
step "8/8 — Apply Kubernetes manifests"

# Substitute image tags into the manifest before applying
sed \
  -e "s|REGION-docker.pkg.dev/PROJECT_ID/rag-repo/rag-api:latest|${REGISTRY}/rag-api:${IMAGE_TAG}|g" \
  -e "s|REGION-docker.pkg.dev/PROJECT_ID/rag-repo/rag-frontend:latest|${REGISTRY}/rag-frontend:${IMAGE_TAG}|g" \
  infra/k8s/deployment.yml | kubectl apply -f -

ok "Manifests applied"

# Wait for rollout
echo "  Waiting for API rollout..."
kubectl rollout status deployment/rag-api -n "$NAMESPACE" --timeout=300s
echo "  Waiting for Frontend rollout..."
kubectl rollout status deployment/rag-frontend -n "$NAMESPACE" --timeout=300s

# ── Print URLs ─────────────────────────────────────────────────────────────────
API_IP=$(kubectl get svc rag-api-external -n "$NAMESPACE" \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
FRONTEND_IP=$(kubectl get svc rag-frontend-svc -n "$NAMESPACE" \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   GKE Deployment Complete                                ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Cluster  : ${CLUSTER} (${REGION})"
echo "║   API      : http://${API_IP}:80"
echo "║   Frontend : http://${FRONTEND_IP}:80"
echo "║   Images   : ${REGISTRY}/rag-api:${IMAGE_TAG}"
echo "║              ${REGISTRY}/rag-frontend:${IMAGE_TAG}"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Useful commands:"
echo "║     kubectl get pods -n $NAMESPACE"
echo "║     kubectl logs -n $NAMESPACE deploy/rag-api -f"
echo "║     kubectl get hpa -n $NAMESPACE"
echo "╚══════════════════════════════════════════════════════════╝"
