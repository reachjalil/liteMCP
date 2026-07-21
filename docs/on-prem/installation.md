# On-premises installation

LiteMCP Composer can run as two application workloads: a static web console on port
`8080` and an API/MCP server on port `8787`. The server requires a MongoDB
replica set, `WEB_ORIGIN`, and a high-entropy `BETTER_AUTH_SECRET`.

This guide covers the repository's Docker Compose and Helm packaging. It does
not provision DNS, certificates, a production MongoDB cluster, an identity
provider, or a secrets manager.

## Choose a deployment path

| Path | Intended use | MongoDB |
|---|---|---|
| Docker Compose | Local evaluation and single-host testing | Bundled, single-member replica set without database authentication |
| Helm | Staging and production Kubernetes | External replica set or managed MongoDB service |

The Compose database is reachable only on its internal Docker network, but it
does not enable MongoDB authentication. Do not use it as a production database.

## Prerequisites

For Docker Compose:

- Docker Engine 27 or newer with Compose v2;
- at least 4 GiB of available memory;
- `openssl` or another cryptographically secure secret generator.

For Kubernetes:

- Kubernetes 1.29 or newer;
- Helm 3 or 4;
- an ingress controller and TLS certificate management appropriate to the
  cluster;
- a reachable MongoDB replica set;
- a Kubernetes Secret containing the MongoDB URI and Better Auth secret.

Run the non-mutating preflight check before installation:

```bash
./scripts/doctor.sh --target compose
./scripts/doctor.sh --target kubernetes
```

The development machine used to create this repository had Helm and Docker,
but did not have `kubectl` or `kind`. The Helm chart was rendered locally; a
real-cluster smoke test requires those missing tools.

## Docker Compose quick start

1. Create the local environment file:

   ```bash
   cp deploy/docker-compose/.env.example deploy/docker-compose/.env
   openssl rand -base64 48
   ```

2. Put the generated value in `BETTER_AUTH_SECRET` in the new `.env` file. Do
   not commit that file.

3. Validate and start the stack:

   ```bash
   ./scripts/doctor.sh --target compose
   docker compose \
     --env-file deploy/docker-compose/.env \
     -f deploy/docker-compose/compose.yaml \
     up --build --detach
   ```

4. Verify both workloads:

   ```bash
   curl --fail http://127.0.0.1:8787/health
   curl --fail http://127.0.0.1:8080/health
   ```

5. Review logs without printing the environment:

   ```bash
   docker compose \
     --env-file deploy/docker-compose/.env \
     -f deploy/docker-compose/compose.yaml \
     logs --tail=100 server web mongodb
   ```

The `mongodb-data` named volume persists across `down` and container
replacement. `docker compose down --volumes` deletes that data and should not
be used unless permanent removal is intentional and a verified backup exists.

## Kubernetes installation

### 1. Prepare MongoDB

Use a replica-set URI with TLS and authentication in production. The database
principal should be scoped to the LiteMCP Composer database and should not have cluster
administration permissions. Confirm network reachability from the server
namespace before deploying LiteMCP Composer.

Example URI shape only:

```text
mongodb://USER:PASSWORD@mongo-0.example.internal:27017,mongo-1.example.internal:27017/litemcp?replicaSet=rs0&tls=true
```

### 2. Create secrets without putting values in shell history

```bash
kubectl create namespace litemcp
umask 077
openssl rand -base64 48 > /tmp/litemcp-better-auth-secret
# Write the MongoDB URI to /tmp/litemcp-mongodb-uri using your secret manager.
kubectl -n litemcp create secret generic litemcp-runtime \
  --from-file=BETTER_AUTH_SECRET=/tmp/litemcp-better-auth-secret \
  --from-file=MONGODB_URI=/tmp/litemcp-mongodb-uri
rm -f /tmp/litemcp-better-auth-secret /tmp/litemcp-mongodb-uri
```

For production, prefer External Secrets, Secrets Store CSI, Sealed Secrets, or
the platform's native secret integration over manually managed Secrets. The
chart references an existing Secret and does not need the plaintext values in
a Helm release.

### 3. Select values

Start from one of the checked examples:

- `deploy/helm/litemcp/examples/minimal-values.yaml` for one replica;
- `deploy/helm/litemcp/examples/ha-values.yaml` for multiple replicas and
  disruption budgets;
- `deploy/helm/litemcp/examples/external-mongodb-values.yaml` for explicit
  external-database wiring;
- `deploy/helm/litemcp/examples/air-gapped-values.yaml` for mirrored images.

Copy the selected example outside the repository and set at least:

- immutable server and web image tags or digests;
- `config.webOrigin` to the public HTTPS web origin;
- `config.apiOrigin` to the client-reachable HTTPS API/MCP origin (normally the
  same origin when ingress routes `/api` and `/mcp`);
- both `auth.existingSecret` and `mongodb.existingSecret` to
  `litemcp-runtime`;
- ingress class, host, and TLS secret;
- resource requests and limits sized from load testing.

Never put `auth.secret` or `mongodb.uri` directly in a committed values file.
Those direct values exist only for disposable smoke environments.

### 4. Render, install, and wait

```bash
helm lint deploy/helm/litemcp
helm template litemcp deploy/helm/litemcp \
  --namespace litemcp \
  --values /secure/path/litemcp-values.yaml > /tmp/litemcp-rendered.yaml

helm upgrade --install litemcp deploy/helm/litemcp \
  --namespace litemcp \
  --values /secure/path/litemcp-values.yaml \
  --atomic \
  --wait \
  --timeout 10m
```

Inspect `/tmp/litemcp-rendered.yaml` for expected hostnames, image references,
security contexts, and Secret references before the install. It should not
contain plaintext secrets when existing Secrets are configured.

### 5. Verify

```bash
kubectl -n litemcp get deploy,pod,service,ingress
kubectl -n litemcp wait \
  --for=condition=available \
  deployment \
  --selector=app.kubernetes.io/instance=litemcp \
  --timeout=5m
```

Then test the public TLS endpoints. The server health endpoint is `/health`.
The chart's readiness and liveness probes use that endpoint and the web
container's local `/health` endpoint.

## Production requirements

- Terminate TLS at a trusted ingress and redirect HTTP to HTTPS.
- Restrict MongoDB ingress to server pods and require TLS and authentication.
- Store secrets outside Git and rotate them through a documented procedure.
- Pin images by digest, retain their SBOMs, and verify signatures where your
  registry supports it.
- Send application and Kubernetes audit events to the organization's
  observability platform without retaining tool payloads by default.
- Configure PodDisruptionBudgets only when the corresponding workload has at
  least two replicas.
- Test backup and restore before onboarding production users.
- Review egress policy for every allowed MCP upstream and identity provider.

See [backup and restore](backup-restore.md),
[upgrades and rollbacks](upgrades-rollbacks.md), and
[air-gapped installation](air-gapped.md) for operational procedures.
