# Configuration reference

This reference covers the implemented Node, managed cloud, web, CLI, Docker,
and Kubernetes configuration. Values shown here are examples, not production
secrets.

## General rules

1. Keep demo mode off in every shared, public, or production environment.
2. Use exact HTTPS public and trusted origins.
3. Provide secrets through the deployment secret mechanism; never commit
   `.env`, `.dev.vars`, Kubernetes Secret values, tokens, or provider keys.
4. Use MongoDB for portable production persistence. The memory store is
   available only in explicit demo/insecure-development modes; managed cloud
   separates eventually consistent KV catalog data from its per-tenant Durable
   Object authority.
5. Treat host stdio as unsafe evaluation functionality even when allowed.
6. Treat analytics as optional, fail-open metadata. Disabling it must not
   weaken audit, authorization, or exact quota enforcement.

## Portable Node server

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `PORT` | No | `8787` | HTTP listen port |
| `HOST` | No | `127.0.0.1` in demo/insecure dev, `0.0.0.0` otherwise | Listen address |
| `API_ORIGIN` | Production | `http://localhost:8787` | Exact public API/MCP origin used in generated URLs |
| `WEB_ORIGIN` | Production | `http://localhost:4321` | Comma-separated exact trusted web origins |
| `LITEMCP_DEMO_MODE` | No | `false` | Enables deterministic local demo behavior |
| `LITEMCP_INSECURE_DEV` | No | `false` | Explicit local-only escape hatch for memory storage/no auth; never set in shared or production environments |
| `LITEMCP_UNSAFE_DEMO_BIND` | No | `false` | Allows either explicit local mode to bind off loopback; use only in isolated disposable tests |
| `MONGODB_URI` | Outside demo/insecure dev | none | MongoDB connection URI; startup fails without it in normal mode |
| `MONGODB_DATABASE` | No | `litemcp` | Product and Better Auth database name |
| `ANALYTICS_ENABLED` | No | `false` | Enables the payload-free Insight Plane; memory is used in explicit local modes and Mongo `usage_events` otherwise |
| `ANALYTICS_RETENTION_DAYS` | No | `90` | Mongo time-series TTL in days when analytics is enabled |
| `ANALYTICS_MAX_QUEUE_SIZE` | No | `10000` | Maximum accepted analytics events buffered in-process before fail-open drops |
| `ANALYTICS_BATCH_SIZE` | No | `250` | Maximum Mongo analytics documents written per flush batch |
| `ANALYTICS_FLUSH_INTERVAL_MS` | No | `100` | Delay before a queued Mongo analytics flush; shutdown also drains accepted work |
| `LITEMCP_QUOTA_SERVERS` | No | effectively unlimited | Optional deployment-local server guardrail; safe integer from 0 through `Number.MAX_SAFE_INTEGER` |
| `LITEMCP_QUOTA_COMPOSITIONS` | No | effectively unlimited | Optional deployment-local composition guardrail |
| `LITEMCP_QUOTA_ACTIVE_SESSIONS` | No | effectively unlimited | Optional deployment-local active-session guardrail |
| `LITEMCP_QUOTA_TOOL_CALLS_PER_DAY` | No | effectively unlimited | Optional deployment-local daily tool-call guardrail |
| `BETTER_AUTH_SECRET` | Outside demo/insecure dev | none | Strong Better Auth secret of at least 32 characters |
| `BETTER_AUTH_URL` | No | `API_ORIGIN` | Better Auth base URL |
| `SIGNUPS_ENABLED` | No | `true` in demo/insecure dev; `false` otherwise | Opens password signup only when explicitly enabled; production also requires email delivery |
| `RESEND_API_KEY` | When production signup is enabled | none | Resend credential for verification, reset, and invitation email |
| `EMAIL_FROM` | When production signup is enabled | none | Verified sender address; must be configured with `RESEND_API_KEY` |
| `EMAIL_REPLY_TO` | No | none | Optional reply-to address |
| `UPSTREAM_TIMEOUT_MS` | No | `20000` | Remote HTTP and stdio execution timeout |
| `UPSTREAM_MAX_RESPONSE_BYTES` | No | `2097152` | Maximum remote HTTP response body |
| `LITEMCP_ENABLE_UNSAFE_HOST_STDIO` | No | `false` | Separate opt-in for host process execution |
| `LITEMCP_STDIO_ALLOWLIST` | No | empty | Comma-separated exact executable paths/names; effective only with unsafe opt-in |

Normal startup fails before listening when either `MONGODB_URI` or
`BETTER_AUTH_SECRET` is absent. Memory/no-auth startup requires an explicit
`LITEMCP_DEMO_MODE=true` or `LITEMCP_INSECURE_DEV=true`; neither mode is a
production fallback. Production signup also fails closed unless both
`RESEND_API_KEY` and `EMAIL_FROM` are configured.

Self-hosted quotas are local governance controls, not license enforcement. When
the four `LITEMCP_QUOTA_*` variables are absent, the Node runtime uses
`Number.MAX_SAFE_INTEGER` as a finite representation of unlimited for the
existing usage API. It never resolves limits from LiteMCP Cloud, a billing
endpoint, telemetry, or any other call-home path. Set an explicit finite value
only when the deployment operator wants a capacity guardrail; `0` blocks new
use of that resource.

Example local demo:

```bash
LITEMCP_DEMO_MODE=true pnpm --filter @litemcp/server dev
```

Example portable runtime:

```bash
MONGODB_URI='mongodb://mongo.example.internal:27017/litemcp?replicaSet=rs0' \
MONGODB_DATABASE='litemcp' \
ANALYTICS_ENABLED=true \
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
| `DATA_KV` | Yes | Eventually consistent KV storage for read-heavy catalog documents |
| `TENANT_AUTHORITY` | Yes | Per-tenant SQLite Durable Object for sessions, first-write client attribution, authority, approvals, audit, OAuth state, and quota counters |
| `USAGE_ANALYTICS` | When analytics is enabled | Workers Analytics Engine dataset for tenant-indexed, payload-free trend emission (`litemcp_usage_production` or `litemcp_usage_staging`) |
| `TENANT_FEED` | When analytics is enabled | Sibling per-tenant `TenantFeedDurableObject` binding for the capped exact query feed; never an authority or audit store |
| `ANALYTICS_ENABLED` | No | Checked in as `true` for production and staging; disabling emission/query must not change audit or quota enforcement |
| `TENANT_FEED_MAX_EVENTS` | No | `500`; accepted range 100–10,000 newest exact events retained per tenant |
| `BETTER_AUTH_SECRET` | Yes outside local demo | Secret configured with Wrangler, never in `wrangler.jsonc` |
| `CREDENTIAL_MASTER_KEY` | Managed deployments | At least 32 bytes used for application-level encryption of identity-provider secrets; store only as a deployment secret |
| `PUBLIC_ORIGIN` | Yes | Worker/API/MCP public origin |
| `WEB_ORIGINS` | Yes | Comma-separated exact trusted browser origins |
| `LITEMCP_DEMO_MODE` | No | Must be `false` for public deployments; the Worker rejects public demo origins |
| `SIGNUPS_ENABLED` | No | Defaults/checks in as `false`; enable only after email delivery is configured |
| `RESEND_API_KEY` | When signup is enabled | Secret used for verification, reset, and invitation email delivery |
| `EMAIL_FROM` | When signup is enabled | Verified sender value, supplied as a secret rather than committed config |
| `EMAIL_REPLY_TO` | No | Optional reply-to value supplied through the secret store |
| `SENTRY_DSN` | Managed deployments | Sentry project DSN used by the Cloudflare Worker SDK for handled and unhandled errors |
| `SENTRY_ENVIRONMENT` | Yes | Checked-in deployment label (`production` or `staging`) attached to error events |

The managed query API currently reads `TENANT_FEED`, not Analytics Engine SQL.
Increasing an HTTP date range does not restore events evicted by the count cap.
`USAGE_ANALYTICS` is emission-only in this revision; no Cloudflare analytics
token or SQL proxy is configured. Exact `/usage` values continue to come from
authority/inventory state.

Local commands:

```bash
pnpm --filter @litemcp/managed-cloud db:migrate:local
pnpm managed-cloud:dev
```

Fresh-account provisioning cannot use `wrangler versions upload`: Cloudflare
requires `wrangler deploy` for a first Worker and for every pending Durable
Object lifecycle change. Create KV/D1 explicitly, review their checked-in IDs,
and apply the exact verified CI payload with secure first-deploy secrets and
maintenance controls from the
[Durable Object lifecycle runbook](./operations/cloudflare-durable-object-lifecycle.md).
The remote lifecycle check must pass before ordinary production commands:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler login
pnpm --filter @litemcp/managed-cloud exec wrangler whoami
pnpm managed-cloud:do-lifecycle -- --env production
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put BETTER_AUTH_SECRET --env=
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put CREDENTIAL_MASTER_KEY --env=
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put SENTRY_DSN --env=
pnpm --filter @litemcp/managed-cloud db:migrate:remote
```

Configure the account-owned route/custom domain and make `PUBLIC_ORIGIN` and
`WEB_ORIGINS` match it before directing traffic to the Worker. Apply trigger
changes as a separate reviewed mutation, then use the exact-CI-artifact staging
and production workflows:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler triggers deploy --env=
```

A successful command is not full deployment acceptance. The public preview at
[`litemcpcomposer.com`](https://litemcpcomposer.com) has recorded static asset,
`/health`, `/ready`, unauthenticated Better Auth session, TLS, and canonical
domain smoke evidence. It does not yet have passing first-admin, privileged
control-plane, session issue, MCP initialize/list/call, audit correlation,
SSO/SCIM, rollback, load, or security acceptance.

After the one-time lifecycle/resource bootstrap, the checked-in staging workflow
can run manually or after a green `main` CI build; production remains an
explicit promotion dispatch. The deployment requires distinct `managed-cloud`
environment secrets `CLOUDFLARE_MIGRATION_API_TOKEN` (D1 read/write only) and
`CLOUDFLARE_DEPLOY_API_TOKEN` (Worker version/static-asset upload and deployment
only), plus `CLOUDFLARE_ACCOUNT_ID` and variables `MANAGED_CLOUD_URL`,
`MANAGED_CLOUD_RESOURCES_READY=true`, the authenticated MCP smoke tuple, and
repository-level opt-in `CUSTOMER_OWNED_REFERENCE_DEPLOY=true`. Production is
manual only; its preflight fails a disabled or non-main dispatch. The exact URL
must match `PUBLIC_ORIGIN` and appear in `WEB_ORIGINS`.

The named Wrangler `staging` environment repeats every non-inherited variable
and binding with a distinct Worker, route, KV namespace, D1 database, and
Durable Object namespace. Its automated workflow stays disabled until
account-owned staging resource IDs are checked in and the
`managed-cloud-staging` environment supplies its credentials, exact URL, and
resource-ready marker. Repository variable
`MANAGED_CLOUD_STAGING_AUTO_DEPLOY=true` enables the exact-CI-artifact automatic
path; manual dispatch remains available and fails when
the shared opt-in is absent. The YAML names the environments but cannot
configure GitHub reviewers or deployment-branch rules; repository admins must
add those controls before enabling deployment, and the current upstream
repository does not have them. Run both compile-time checks without credentials:

The production and staging resource-ready markers also attest that an
account-owned route/custom domain has already been applied with the explicit
Wrangler target, DNS/TLS resolves the exact configured origin, and the active
Worker has the final checked-in Durable Object migration tag and bindings.
Wrangler `versions upload`/`versions deploy` does not apply triggers; trigger
changes are separate reviewed mutations. Each workflow performs a credentialed
read-only lifecycle check before upload and relies on public smoke to fail closed on trigger drift.

```bash
node scripts/check-managed-cloud-wrangler.mjs
pnpm managed-cloud:do-lifecycle -- --self-test
pnpm --filter @litemcp/managed-cloud wrangler:dry-run
pnpm --filter @litemcp/managed-cloud wrangler:dry-run:staging
```

See [`../apps/managed-cloud/README.md`](../apps/managed-cloud/README.md) for the
staging bootstrap, signup/email gate, deployment variables, and optional
authenticated MCP smoke configuration.

## Astro web app

The Astro site is static and the React console calls the control-plane origin.
Build-time/public configuration must never contain secrets. The managed cloud
Worker serves the built assets; the portable container uses a static web server
and proxies API/MCP routes to `apps/server`. The container runtime template
consumes `API_UPSTREAM`; Compose sets it to `http://server:8787` and Helm sets
it to the release-qualified server Service. It is an internal upstream, not a
browser-visible origin.

The login UI reads `SIGNUPS_ENABLED` at Astro build time. Managed-cloud
`build:web`/`build:web:staging` derive it and `PUBLIC_API_ORIGIN` from the
selected Wrangler target. Standalone web builds must set the same signup value
as the backend runtime; exposing a signup form does not bypass the backend's
email-delivery gate.

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
- a single-member MongoDB replica set with client authentication and a
  replica-set keyfile;
- health/readiness checks;
- non-root/read-only application containers where supported;
- persistent volumes and an isolated internal network.

Render before starting:

```bash
docker compose -f deploy/docker-compose/compose.yaml config
```

The Compose path is for evaluation until the authenticated complete-product
smoke, persistence, backup, and restore have been proven in the target
environment. Its bundled database uses the bootstrap/root account; production
deployments need a least-privilege application user, managed secrets, TLS, and a
highly available replica set.

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
| Memory | Tests and explicit local demo | Deterministic but not durable; optional analytics is process-local |
| MongoDB | Portable Node/Docker/Kubernetes | Tenant-qualified product records and conditional revisions; optional analytics uses a separate tenant-filtered time-series collection with configurable TTL and bounded fail-open buffering |
| Cloudflare hybrid | Managed cloud | Non-authoritative KV records are eventually consistent; per-tenant SQLite Durable Objects serialize the security-sensitive slice per document, while Analytics Engine plus a sibling capped tenant feed remain separate from authority |

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
- When analytics is enabled, verify one aggregate discovery and one terminal
  call event, exact `/usage` standing, configured retention/feed caps, and the
  absence of arguments/results. Do not use analytics availability as an audit
  or readiness signal.
- Record version, image digest, migration, rollback target, and operator.
