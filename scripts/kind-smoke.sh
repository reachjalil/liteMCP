#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
CHART_DIR="${REPO_ROOT}/deploy/helm/litemcp"

CLUSTER_NAME=${KIND_CLUSTER_NAME:-litemcp-smoke}
NAMESPACE=${KIND_NAMESPACE:-litemcp-smoke}
RELEASE_NAME=${HELM_RELEASE_NAME:-litemcp}
SERVER_FORWARD_PORT=${SERVER_FORWARD_PORT:-8787}
WEB_FORWARD_PORT=${WEB_FORWARD_PORT:-8080}
IMAGE_TAG=${LITEMCP_SMOKE_IMAGE_TAG:-smoke}
KEEP_CLUSTER=${KEEP_KIND_CLUSTER:-0}
REUSE_CLUSTER=${REUSE_KIND_CLUSTER:-0}

SERVER_IMAGE="ghcr.io/reachjalil/litemcp-server:${IMAGE_TAG}"
WEB_IMAGE="ghcr.io/reachjalil/litemcp-web:${IMAGE_TAG}"
KUBE_CONTEXT="kind-${CLUSTER_NAME}"
CREATED_CLUSTER=0
CREATED_NAMESPACE=0
SERVER_FORWARD_PID=
WEB_FORWARD_PID=
TEMP_DIR=
PREVIOUS_CONTEXT=$(kubectl config current-context 2>/dev/null || true)

usage() {
  cat <<'EOF'
Usage: scripts/kind-smoke.sh

Builds the LiteMCP Composer images, creates an ephemeral kind cluster, starts a
single-member MongoDB replica set, installs the Helm chart, and checks the web
and server health endpoints. It does not publish images.

Environment overrides:
  KIND_CLUSTER_NAME, KIND_NAMESPACE, HELM_RELEASE_NAME
  SERVER_FORWARD_PORT, WEB_FORWARD_PORT, LITEMCP_SMOKE_IMAGE_TAG
  KEEP_KIND_CLUSTER=1       Keep a cluster created by this run.
  REUSE_KIND_CLUSTER=1      Reuse an existing cluster; it will never be deleted.
EOF
}

if [[ ${1:-} == -h || ${1:-} == --help ]]; then
  usage
  exit 0
fi
if (($#)); then
  usage >&2
  exit 2
fi

for required_command in docker kubectl kind helm curl openssl; do
  command -v "$required_command" >/dev/null 2>&1 || {
    printf '%s is required.\n' "$required_command" >&2
    exit 1
  }
done

docker info >/dev/null 2>&1 || {
  printf 'Docker daemon is not reachable.\n' >&2
  exit 1
}

cleanup() {
  local smoke_exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "$SERVER_FORWARD_PID" ]]; then
    kill "$SERVER_FORWARD_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$WEB_FORWARD_PID" ]]; then
    kill "$WEB_FORWARD_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi

  if [[ $CREATED_CLUSTER -eq 1 && "$KEEP_CLUSTER" != 1 ]]; then
    kind delete cluster --name "$CLUSTER_NAME" >/dev/null 2>&1 || true
  elif [[ $CREATED_NAMESPACE -eq 1 && "$KEEP_CLUSTER" != 1 ]]; then
    kubectl --context "$KUBE_CONTEXT" delete namespace "$NAMESPACE" \
      --wait=false >/dev/null 2>&1 || true
  fi

  if [[ -n "$PREVIOUS_CONTEXT" ]] && kubectl config get-contexts "$PREVIOUS_CONTEXT" >/dev/null 2>&1; then
    kubectl config use-context "$PREVIOUS_CONTEXT" >/dev/null 2>&1 || true
  fi

  return "$smoke_exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if kind get clusters 2>/dev/null | grep -Fxq "$CLUSTER_NAME"; then
  if [[ "$REUSE_CLUSTER" != 1 ]]; then
    printf 'kind cluster %s already exists. Set REUSE_KIND_CLUSTER=1 to use it.\n' "$CLUSTER_NAME" >&2
    exit 1
  fi
  printf 'Reusing kind cluster %s; this script will not delete it.\n' "$CLUSTER_NAME"
else
  kind create cluster --name "$CLUSTER_NAME" --wait 120s
  CREATED_CLUSTER=1
fi

KUBECTL=(kubectl --context "$KUBE_CONTEXT" --namespace "$NAMESPACE")

if [[ $CREATED_CLUSTER -eq 0 ]] && kubectl --context "$KUBE_CONTEXT" get namespace "$NAMESPACE" >/dev/null 2>&1; then
  printf 'Namespace %s already exists in a reused cluster; refusing to overwrite it.\n' "$NAMESPACE" >&2
  printf 'Choose a new KIND_NAMESPACE or remove it explicitly after reviewing its contents.\n' >&2
  exit 1
fi

kubectl --context "$KUBE_CONTEXT" create namespace "$NAMESPACE"
CREATED_NAMESPACE=1

printf 'Building local images...\n'
docker build \
  --file "${REPO_ROOT}/deploy/docker/server.Dockerfile" \
  --tag "$SERVER_IMAGE" \
  "$REPO_ROOT"
docker build \
  --file "${REPO_ROOT}/deploy/docker/web.Dockerfile" \
  --tag "$WEB_IMAGE" \
  "$REPO_ROOT"

kind load docker-image --name "$CLUSTER_NAME" "$SERVER_IMAGE" "$WEB_IMAGE"

cat <<'YAML' | "${KUBECTL[@]}" apply -f -
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  labels:
    app.kubernetes.io/name: mongodb
    app.kubernetes.io/part-of: litemcp-smoke
spec:
  selector:
    app.kubernetes.io/name: mongodb
  ports:
    - name: mongodb
      port: 27017
      targetPort: mongodb
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongodb
  labels:
    app.kubernetes.io/name: mongodb
    app.kubernetes.io/part-of: litemcp-smoke
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: mongodb
  template:
    metadata:
      labels:
        app.kubernetes.io/name: mongodb
    spec:
      automountServiceAccountToken: false
      containers:
        - name: mongodb
          image: mongo:8.0
          imagePullPolicy: IfNotPresent
          args:
            - --bind_ip_all
            - --replSet
            - rs0
          ports:
            - name: mongodb
              containerPort: 27017
          readinessProbe:
            exec:
              command:
                - mongosh
                - --host
                - 127.0.0.1:27017
                - --quiet
                - --eval
                - db.adminCommand({ping:1}).ok
            initialDelaySeconds: 5
            periodSeconds: 3
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 1Gi
          volumeMounts:
            - name: data
              mountPath: /data/db
      volumes:
        - name: data
          emptyDir: {}
YAML

"${KUBECTL[@]}" rollout status deployment/mongodb --timeout=180s
"${KUBECTL[@]}" exec deployment/mongodb -- mongosh --quiet --eval \
  'try { rs.status().ok } catch (error) { rs.initiate({_id:"rs0",members:[{_id:0,host:"mongodb:27017"}]}).ok }'

for _ in $(seq 1 30); do
  if "${KUBECTL[@]}" exec deployment/mongodb -- mongosh --quiet --eval 'rs.status().ok' 2>/dev/null | grep -q 1; then
    break
  fi
  sleep 2
done
"${KUBECTL[@]}" exec deployment/mongodb -- mongosh --quiet --eval 'if (rs.status().ok !== 1) quit(1)'

TEMP_DIR=$(mktemp -d)
umask 077
openssl rand -base64 48 >"${TEMP_DIR}/BETTER_AUTH_SECRET"
"${KUBECTL[@]}" create secret generic litemcp-smoke-runtime \
  --from-file="BETTER_AUTH_SECRET=${TEMP_DIR}/BETTER_AUTH_SECRET"

helm upgrade --install "$RELEASE_NAME" "$CHART_DIR" \
  --kube-context "$KUBE_CONTEXT" \
  --namespace "$NAMESPACE" \
  --set-string "image.server.repository=ghcr.io/reachjalil/litemcp-server" \
  --set-string "image.server.tag=${IMAGE_TAG}" \
  --set-string "image.server.pullPolicy=Never" \
  --set-string "image.web.repository=ghcr.io/reachjalil/litemcp-web" \
  --set-string "image.web.tag=${IMAGE_TAG}" \
  --set-string "image.web.pullPolicy=Never" \
  --set-string "config.webOrigin=http://127.0.0.1:${WEB_FORWARD_PORT}" \
  --set-string "config.apiOrigin=http://127.0.0.1:${SERVER_FORWARD_PORT}" \
  --set-string 'mongodb.uri=mongodb://mongodb:27017/litemcp?replicaSet=rs0' \
  --set-string 'auth.existingSecret=litemcp-smoke-runtime' \
  --set 'server.replicaCount=1' \
  --set 'web.replicaCount=1' \
  --set 'podDisruptionBudget.server.enabled=false' \
  --set 'podDisruptionBudget.web.enabled=false' \
  --set 'networkPolicy.enabled=false' \
  --atomic \
  --wait \
  --timeout 5m

"${KUBECTL[@]}" wait \
  --for=condition=available \
  deployment \
  --selector="app.kubernetes.io/instance=${RELEASE_NAME}" \
  --timeout=180s

server_service=$("${KUBECTL[@]}" get service \
  --selector="app.kubernetes.io/instance=${RELEASE_NAME},app.kubernetes.io/component=server" \
  --output=jsonpath='{.items[0].metadata.name}')
web_service=$("${KUBECTL[@]}" get service \
  --selector="app.kubernetes.io/instance=${RELEASE_NAME},app.kubernetes.io/component=web" \
  --output=jsonpath='{.items[0].metadata.name}')

"${KUBECTL[@]}" port-forward "service/${server_service}" "${SERVER_FORWARD_PORT}:8787" \
  >"${TEMP_DIR}/server-port-forward.log" 2>&1 &
SERVER_FORWARD_PID=$!
"${KUBECTL[@]}" port-forward "service/${web_service}" "${WEB_FORWARD_PORT}:8080" \
  >"${TEMP_DIR}/web-port-forward.log" 2>&1 &
WEB_FORWARD_PID=$!

for _ in $(seq 1 30); do
  if curl --fail --silent "http://127.0.0.1:${SERVER_FORWARD_PORT}/ready" >/dev/null 2>&1 && \
    curl --fail --silent "http://127.0.0.1:${WEB_FORWARD_PORT}/health" >/dev/null 2>&1 && \
    curl --fail --silent "http://127.0.0.1:${WEB_FORWARD_PORT}/ready" >/dev/null 2>&1; then
    printf 'Smoke test passed: server readiness and the web proxy are ready.\n'
    exit 0
  fi
  sleep 2
done

printf 'Health checks did not become ready.\n' >&2
"${KUBECTL[@]}" get pods >&2 || true
"${KUBECTL[@]}" logs \
  --selector="app.kubernetes.io/instance=${RELEASE_NAME},app.kubernetes.io/component=server" \
  --tail=100 >&2 || true
"${KUBECTL[@]}" logs \
  --selector="app.kubernetes.io/instance=${RELEASE_NAME},app.kubernetes.io/component=web" \
  --tail=100 >&2 || true
exit 1
