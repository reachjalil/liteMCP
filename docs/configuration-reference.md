# Configuration reference

This reference covers the implemented Node, managed cloud, web, CLI, Docker,
and Kubernetes configuration. Values shown here are examples, not production
secrets.

## General rules

1. Keep demo mode off in every shared, public, or production environment.
2. Use exact HTTPS public and trusted origins.
3. Provide secrets through the deployment secret mechanism; never commit
   `.env`, `.dev.vars`, Kubernetes Secret values, tokens, or provider keys.
4. Use MongoDB for portable production persistence. The memory store is demo
   only; Workers KV currently lacks the strong serialization required for a
   production managed cloud authority.
5. Treat host stdio as unsafe evaluation functionality even when allowed.

## Portable Node server

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `PORT` | No | `8787` | HTTP listen port |
| `HOST` | No | `127.0.0.1` in demo, `0.0.0.0` otherwise | Listen address |
| `API_ORIGIN` | Production | `http://localhost:8787` | Exact public API/MCP origin used in generated URLs |
| `WEB_ORIGIN` | Production | `http://localhost:4321` | Comma-separated exact trusted web origins |
| `LITEMCP_DEMO_MODE` | No | `false` | Enables deterministic local demo behavior |
| `LITEMCP_UNSAFE_DEMO_BIND` | No | `false` | Allows demo mode to bind off loopback; use only in isolated disposable tests |
| `MONGODB_URI` | Production | none | MongoDB connection URI; absence selects memory storage |
| `MONGODB_DATABASE` | No | `litemcp` | Product and Better Auth database name |
| `BETTER_AUTH_SECRET` | Production | none | Strong Better Auth secret; required outside explicit demo mode when Mongo is configured |
| `BETTER_AUTH_URL` | No | `API_ORIGIN` | Better Auth base URL |
| `UPSTREAM_TIMEOUT_MS` | No | `20000` | Remote HTTP and stdio execution timeout |
| `UPSTREAM_MAX_RESPONSE_BYTES` | No | `2097152` | Maximum remote HTTP response body |
| `LITEMCP_ENABLE_UNSAFE_HOST_STDIO` | No | `false` | Separate opt-in for host process execution |
| `LITEMCP_STDIO_ALLOWLIST` | No | empty | Comma-separated exact executable paths/names; effective only with unsafe opt-in |

Production startup fails when MongoDB is configured without
`BETTER_AUTH_SECRET`. Production readiness also fails when auth or durable
storage is absent.

Example local demo:

```bash
LITEMCP_DEMO_MODE=true pnpm --filter @litemcp/server dev
```

Example portable runtime:

```bash
MONGODB_URI='mongodb://mongo.example.internal:27017/litemcp?replicaSet=rs0' \
MONGODB_DATABASE='litemcp' \
BETTER_AUTH_SECRET='replace-with-at-least-32-random-characters' \
API_ORIGIN='https://composer.example.com' \
WEB_ORIGIN='https://composer.example.com' \
LITEMCP_DEMO_MODE=false \
node apps/server/dist/index.js
```

## Managed cloud app

The product/deployment name is managed cloud. Cloudflare is the current
provider and its technical names remain in Wrangler bindings and the adapter.

| Binding or variable | Required | Purpose |
| --- | --- | --- |
| `ASSETS` | Yes | Built Astro static asset binding |
| `AUTH_DB` | Yes | D1 database for Better Auth records |
| `DATA_KV` | Yes | Workers KV product document adapter |
| `BETTER_AUTH_SECRET` | Yes outside local demo | Secret configured with Wrangler, never in `wrangler.jsonc` |
| `PUBLIC_ORIGIN` | Yes | Worker/API/MCP public origin |
| `WEB_ORIGINS` | Yes | Comma-separated exact trusted browser origins |
| `LITEMCP_DEMO_MODE` | No | Must be `false` for public deployments; the Worker rejects public demo origins |

Local commands:

```bash
pnpm --filter @litemcp/managed-cloud db:migrate:local
pnpm managed-cloud:dev
```

Fresh-account provisioning uses an inactive Worker version so draft KV and D1
bindings exist before the remote migration runs:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler login
pnpm --filter @litemcp/managed-cloud exec wrangler whoami
pnpm --filter @litemcp/web build
pnpm --filter @litemcp/managed-cloud exec wrangler versions upload
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put BETTER_AUTH_SECRET
pnpm --filter @litemcp/managed-cloud db:migrate:remote
```

Configure the account-owned route/custom domain and make `PUBLIC_ORIGIN` and
`WEB_ORIGINS` match it before directing traffic to the Worker. Then deploy:

```bash
pnpm managed-cloud:deploy
```

A successful command is not full deployment acceptance. The public preview at
[`litemcpcomposer.com`](https://litemcpcomposer.com) has recorded static asset,
`/health`, `/ready`, unauthenticated Better Auth session, TLS, and canonical
domain smoke evidence. It does not yet have passing first-admin, privileged
control-plane, session issue, MCP initialize/list/call, audit correlation,
SSO/SCIM, rollback, load, or security acceptance.

After the one-time inactive-version bootstrap, the checked-in GitHub deployment
workflow can run manually or after a green `main` CI build. It requires the
`managed-cloud` environment secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, plus variables `MANAGED_CLOUD_URL`,
`MANAGED_CLOUD_RESOURCES_READY=true`, and
`MANAGED_CLOUD_AUTO_DEPLOY=true` for automatic runs. The exact URL must match
`PUBLIC_ORIGIN` and appear in `WEB_ORIGINS`.

## Astro web app

The Astro site is static and the React console calls the control-plane origin.
Build-time/public configuration must never contain secrets. The managed cloud
Worker serves the built assets; the portable container uses a static web server
and proxies API/MCP routes to `apps/server`. The container runtime template
consumes `API_UPSTREAM`; Compose sets it to `http://server:8787` and Helm sets
it to the release-qualified server Service. It is an internal upstream, not a
browser-visible origin.

Useful commands:

```bash
pnpm dev:web
pnpm --filter @litemcp/web check
pnpm --filter @litemcp/web build
```

## CLI

| Variable | Purpose |
| --- | --- |
| `LITEMCP_API_URL` | Default control-plane base URL |
| `LITEMCP_TENANT_ID` | Explicit local demo tenant header |
| `LITEMCP_DEMO_ROLE` | Explicit local demo role |

Production CLI authentication is not yet a complete login/service-credential
journey. Do not use demo tenant or role headers outside explicit local demo
mode.

## Docker Compose

The checked-in Compose stack configures:

- the static web proxy;
- portable Node server;
- a MongoDB replica set;
- health/readiness checks;
- non-root/read-only application containers where supported;
- persistent volumes and an isolated internal network.

Render before starting:

```bash
docker compose -f deploy/docker-compose/compose.yaml config
```

The Compose path is for evaluation until Mongo authentication, complete product
smoke, persistence, backup, and restore have been proven in the target
environment.

## Helm values

The chart lives at `deploy/helm/litemcp`. Its values schema documents and
validates the supported shape. Important groups include:

- server and web image repositories, tags, pull policies, and pull secrets;
- replicas, resources, security contexts, and pod security contexts;
- `existingSecret` references for runtime secrets;
- internal or external MongoDB configuration;
- required `config.webOrigin` and client-reachable `config.apiOrigin` values;
- Ingress/TLS and service configuration;
- startup, readiness, and liveness probes;
- HPA, PDB, topology spread, affinity, tolerations, and node selection;
- NetworkPolicy and observability hooks;
- air-gap settings and disabled call-home defaults.

Validate every change:

```bash
helm lint --strict deploy/helm/litemcp
helm template litemcp deploy/helm/litemcp
```

See [`../deploy/helm/litemcp/README.md`](../deploy/helm/litemcp/README.md) and
[`on-prem/installation.md`](./on-prem/installation.md) for installation details.

## Storage guarantees

| Adapter | Intended use | Important guarantee |
| --- | --- | --- |
| Memory | Tests and explicit local demo | Deterministic but not durable |
| MongoDB | Portable Node/Docker/Kubernetes | Tenant-qualified records and conditional revisions; some multi-record workflows still need transactions/outbox |
| Workers KV | Managed cloud evaluation/read model | Eventual consistency and no atomic CAS; not a production authorization/audit authority by itself |

Adapters report capabilities rather than pretending all NoSQL backends provide
the same consistency. See [`known-limitations.md`](./known-limitations.md).

## Configuration change checklist

- Validate exact origins and callback URLs.
- Confirm demo mode is false.
- Confirm secrets are references, not literal values.
- Render Compose/Helm/Wrangler configuration.
- Run type checks, tests, builds, and the Wrangler dry run.
- Verify `/health` and `/ready` independently.
- Issue and revoke a short-lived MCP session.
- Test one allowed and one denied discovery/call.
- Confirm audit records contain request IDs and no credentials.
- Record version, image digest, migration, rollback target, and operator.
