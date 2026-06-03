# GKE Cluster Deployment — Universal RAG Agent

This guide covers deploying the Universal RAG Agent on **Google Kubernetes Engine (GKE)** using Docker Hub images and Cloud Shell.

---

## Prerequisites

- GCP account with billing enabled
- Docker Hub account with images already pushed:
  - `mshan011181/universal-rag-agent-api:v1`
  - `mshan011181/universal-rag-agent-frontend:v1`
- GitHub repo cloned or accessible

---

## How It Works

```
Windows Machine (build once)
        |
        |  docker compose build
        |  docker tag ...
        |  docker push ...
        v
Docker Hub
  mshan011181/universal-rag-agent-api:v1
  mshan011181/universal-rag-agent-frontend:v1
        |
        |  GKE pulls automatically
        v
GKE Cluster (rag-cluster)
  Namespace: rag-agent
        |
        |-- rag-api         (2 pods, port 8000)
        |-- rag-frontend    (2 pods, port 8501)
        |-- rag-redis       (1 pod,  port 6379)
        |-- rag-chromadb    (1 pod,  port 8001)
```

**Your images** (`api`, `frontend`) come from your Docker Hub account.  
**Public images** (`redis:7-alpine`, `chromadb/chroma:0.6.3`) are pulled directly from official Docker Hub repos — no build needed.

---

## Step 1 — Build and Push Docker Images (Windows)

Run these on your local Windows machine before GKE deployment.

```bash
# Build both images
docker compose build

# Tag for Docker Hub
docker tag universal_rag_agent-api      mshan011181/universal-rag-agent-api:v1
docker tag universal_rag_agent-frontend mshan011181/universal-rag-agent-frontend:v1

# Login and push
docker login
docker push mshan011181/universal-rag-agent-api:v1
docker push mshan011181/universal-rag-agent-frontend:v1
```

---

## Step 2 — Open GCP Cloud Shell

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Select your project: **shan-project2**
3. Click the **Cloud Shell** icon (top right toolbar)
4. All tools (`gcloud`, `kubectl`, `git`) are pre-installed — no setup needed

---

## Step 3 — Create the GKE Cluster

> Use `--zone` (not `--region`) to avoid CPU quota errors. Region creates nodes in 3 zones (3x CPU usage).

```bash
gcloud container clusters create rag-cluster \
  --zone=us-central1-a \
  --num-nodes=3 \
  --machine-type=e2-standard-4 \
  --disk-size=50
```

Expected output:
```
Creating cluster rag-cluster in us-central1-a...done.
kubeconfig entry generated for rag-cluster.
```

**Why `e2-standard-4`?** Each node has 4 vCPUs and 16GB RAM. With 3 nodes, that gives 12 vCPUs total — enough to run all pods with HPA headroom.

---

## Step 4 — Connect kubectl to the Cluster

```bash
gcloud container clusters get-credentials rag-cluster --zone=us-central1-a
```

Verify connection:
```bash
kubectl get nodes
```

Expected output:
```
NAME                STATUS   ROLES    AGE   VERSION
gke-rag-cluster-*  Ready    <none>   2m    v1.xx.x
gke-rag-cluster-*  Ready    <none>   2m    v1.xx.x
gke-rag-cluster-*  Ready    <none>   2m    v1.xx.x
```

---

## Step 5 — Clone the Repo (to get deployment.yml)

```bash
git clone https://github.com/mshan011181/universal-rag-agent.git
cd universal-rag-agent
```

> The repo is cloned only to access `infra/k8s/deployment.yml`.  
> GKE does NOT run code from the repo — it pulls Docker images from Docker Hub.

Alternative (skip cloning entirely):
```bash
kubectl apply -f https://raw.githubusercontent.com/mshan011181/universal-rag-agent/main/infra/k8s/deployment.yml
```

---

## Step 6 — Create Kubernetes Secrets

Secrets store sensitive credentials. Never hardcode them in `deployment.yml`.

```bash
kubectl create secret generic rag-secrets \
  --namespace=rag-agent \
  --from-literal=groq-api-key=YOUR_GROQ_API_KEY \
  --from-literal=jwt-secret=YOUR_JWT_SECRET \
  --from-literal=database-url=postgresql://raguser:ragpass@rag-postgres:5432/ragdb
```

Replace `YOUR_GROQ_API_KEY` and `YOUR_JWT_SECRET` with actual values.

---

## Step 7 — Deploy to GKE

```bash
kubectl apply -f infra/k8s/deployment.yml
```

Expected output:
```
namespace/rag-agent created
deployment.apps/rag-api created
service/rag-api-svc created
horizontalpodautoscaler.autoscaling/rag-api-hpa created
deployment.apps/rag-frontend created
service/rag-frontend-svc created
service/rag-api-external created
horizontalpodautoscaler.autoscaling/rag-frontend-hpa created
deployment.apps/rag-redis created
service/rag-redis created
deployment.apps/rag-chromadb created
service/rag-chromadb created
```

---

## Step 8 — Monitor Pod Startup

```bash
kubectl get pods -n rag-agent -w
```

Wait until all pods show `Running`:
```
NAME                            READY   STATUS    RESTARTS   AGE
rag-api-xxxx                    1/1     Running   0          2m
rag-api-xxxx                    1/1     Running   0          2m
rag-frontend-xxxx               1/1     Running   0          2m
rag-frontend-xxxx               1/1     Running   0          2m
rag-redis-xxxx                  1/1     Running   0          1m
rag-chromadb-xxxx               1/1     Running   0          1m
```

> API and Frontend pods take ~60 seconds to start (3.5GB images). Redis and ChromaDB start faster.

Press `Ctrl+C` to stop watching.

---

## Step 9 — Get External IP Addresses

```bash
kubectl get services -n rag-agent
```

Expected output:
```
NAME               TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)
rag-api-svc        ClusterIP      10.x.x.x       <none>           8000/TCP
rag-api-external   LoadBalancer   10.x.x.x       34.xx.xx.xx      80:xxxxx/TCP
rag-frontend-svc   LoadBalancer   10.x.x.x       34.xx.xx.xx      80:xxxxx/TCP
rag-redis          ClusterIP      10.x.x.x       <none>           6379/TCP
rag-chromadb       ClusterIP      10.x.x.x       <none>           8001/TCP
```

- **Frontend URL**: `http://<rag-frontend-svc EXTERNAL-IP>` — Streamlit UI
- **API URL**: `http://<rag-api-external EXTERNAL-IP>/docs` — FastAPI Swagger UI

---

## What Gets Deployed

| Component | Image | Pods | Access |
|---|---|---|---|
| API (FastAPI) | `mshan011181/universal-rag-agent-api:v1` | 2 (min) | LoadBalancer (external) |
| Frontend (Streamlit) | `mshan011181/universal-rag-agent-frontend:v1` | 2 (min) | LoadBalancer (external) |
| Redis | `redis:7-alpine` (public) | 1 | ClusterIP (internal only) |
| ChromaDB | `chromadb/chroma:0.6.3` (public) | 1 | ClusterIP (internal only) |

---

## Horizontal Pod Autoscaler (HPA)

HPA automatically scales API and Frontend pods based on load.

| Setting | API | Frontend |
|---|---|---|
| Min pods | 2 | 2 |
| Max pods | 10 | 10 |
| Scale up when CPU > | 70% | 70% |
| Scale up when Memory > | 80% | 80% |

Check HPA status:
```bash
kubectl get hpa -n rag-agent
```

---

## Resource Limits per Pod

| Component | CPU Request | CPU Limit | RAM Request | RAM Limit |
|---|---|---|---|---|
| API | 500m | 2000m | 2Gi | 4Gi |
| Frontend | 500m | 2000m | 2Gi | 4Gi |
| Redis | 100m | 500m | 256Mi | 512Mi |
| ChromaDB | 200m | 1000m | 512Mi | 2Gi |

---

## Health Probes

Both API and Frontend have liveness and readiness probes configured:

| Probe | API endpoint | Frontend endpoint | Initial delay |
|---|---|---|---|
| Liveness | `/api/health` | `/` | 60s |
| Readiness | `/api/health/ready` | `/` | 30s |

> The 60s initial delay is intentional — Docker images are ~3.5GB and need time to start.

---

## Useful kubectl Commands

```bash
# View all pods
kubectl get pods -n rag-agent

# View all services and external IPs
kubectl get services -n rag-agent

# View HPA scaling status
kubectl get hpa -n rag-agent

# View logs for API pod
kubectl logs -n rag-agent -l app=rag-api --tail=100

# View logs for Frontend pod
kubectl logs -n rag-agent -l app=rag-frontend --tail=100

# Describe a pod (useful for debugging startup issues)
kubectl describe pod -n rag-agent -l app=rag-api

# Confirm which Docker image is running
kubectl describe pod -n rag-agent -l app=rag-api | grep Image:

# Restart all API pods (e.g. after pushing a new image)
kubectl rollout restart deployment/rag-api -n rag-agent

# Restart all Frontend pods
kubectl rollout restart deployment/rag-frontend -n rag-agent
```

---

## Deploying a New Version

When you update code and push a new Docker image:

```bash
# 1. On Windows — build, tag, push new version
docker compose build
docker tag universal_rag_agent-api      mshan011181/universal-rag-agent-api:v2
docker tag universal_rag_agent-frontend mshan011181/universal-rag-agent-frontend:v2
docker push mshan011181/universal-rag-agent-api:v2
docker push mshan011181/universal-rag-agent-frontend:v2

# 2. Update deployment.yml — change v1 to v2 in image tags
# Then in Cloud Shell:
kubectl apply -f infra/k8s/deployment.yml

# OR force a rolling restart without changing the tag:
kubectl rollout restart deployment/rag-api -n rag-agent
kubectl rollout restart deployment/rag-frontend -n rag-agent
```

---

## Delete the Cluster (to stop billing)

```bash
gcloud container clusters delete rag-cluster --zone=us-central1-a
```

> Use `--zone` (not `--region`) — same zone where the cluster was created.

---

## Estimated Cost

| Node type | Nodes | vCPU | RAM | Cost/hour |
|---|---|---|---|---|
| e2-standard-4 | 3 | 12 total | 48GB total | ~$0.40/hr |

- ~$0.40/hour while running
- ~$9.60/day
- Delete cluster when not in use to avoid charges

---

## Troubleshooting

**CPU quota error during cluster creation:**
```
ERROR: Insufficient project quota to satisfy request
```
Fix: Use `--zone` instead of `--region`. Region = 3x CPU usage.

**get-credentials 404 error:**
```
ERROR: (gcloud.container.clusters.get-credentials) ResponseError: code=404
```
Fix: Make sure `--zone` matches where cluster was created:
```bash
gcloud container clusters get-credentials rag-cluster --zone=us-central1-a
```

**Pods stuck in `Pending`:**
```bash
kubectl describe pod -n rag-agent <pod-name>
```
Look for `Insufficient cpu` or `Insufficient memory` in Events.

**Pods stuck in `ImagePullBackOff`:**
- Check Docker Hub image name and tag are correct in `deployment.yml`
- Verify the image is public on Docker Hub

**Secret not found error:**
- Run Step 6 (create secrets) before applying deployment.yml
- Secrets must be created in the same namespace: `--namespace=rag-agent`
