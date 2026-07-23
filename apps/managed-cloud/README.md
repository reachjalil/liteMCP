# Customer-owned Cloudflare reference deployment

This public app is a customer-deployable Cloudflare composition of LiteMCP
Composer. It composes the same auth, control-plane, gateway, policy, and domain
packages used by the portable server. The legacy package and directory name are
retained for compatibility.

LiteMCP's operated cloud adds proprietary cross-customer operations around this
public product core in a separate private repository. Billing, commercial
entitlement projection, platform-staff authorization, support access, fleet
provisioning, and production service credentials are deliberately absent here.

## Responsibilities

- Serve the built Astro site and console through Workers Static Assets.
- Run the Hono control-plane API and MCP gateway in a Worker.
- Store non-authoritative product records in Workers KV and the
  authorization/execution-sensitive product slice in one SQLite Durable Object
  per tenant through `adapter-cloudflare`.
- Store Better Auth records separately in D1.
- Apply the checked-in D1 and Durable Object migrations and bind runtime
  secrets through Wrangler.

Cloudflare-specific bindings stop here. Portable packages must not import
Cloudflare runtime APIs.

## Insight Plane

Both checked-in targets set `ANALYTICS_ENABLED=true` and repeat two isolated
bindings because Wrangler named environments do not inherit them:

- `USAGE_ANALYTICS` writes payload-free, tenant-indexed trend rows to
  `litemcp_usage_production` or `litemcp_usage_staging` in Analytics Engine.
- `TENANT_FEED` addresses a separate `TenantFeedDurableObject` per tenant. Its
  SQLite class has its own `v2-tenant-feed` migration and never shares storage
  or authorization state with `TenantAuthorityDurableObject`.

The platform emits to both destinations through the fail-open composite
recorder and Cloudflare `waitUntil`; an Analytics Engine or feed failure cannot
change a gateway/control-plane response. `ANALYTICS_ENABLED=false` omits both
the recorder and analytics query backend, while exact fair-use counters remain
available independently.

The current `/api/v1/analytics/*` query source is the exact tenant feed. It
keeps the newest 500 events (`TENANT_FEED_MAX_EVENTS`, allowed range
100–10,000), so summary, timeseries, top, recent, session, flow, and policy
results are exact only within that retained ring. Analytics Engine is durable
trend emission in this milestone; there is no checked-in or claimed Analytics
Engine SQL query proxy yet.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm --filter @litemcp/managed-cloud db:migrate:local
pnpm managed-cloud:dev
```

Copy `.dev.vars.example` to `.dev.vars` for local-only values. Never commit
`.dev.vars`, authentication secrets, provider tokens, or generated Wrangler
state.

## Customer-owned production deployment

On a fresh account, create the account-owned KV namespace and D1 database
explicitly and record their reviewed IDs before deployment. A first Worker
deployment and a pending Durable Object lifecycle migration cannot use
`wrangler versions upload`; apply them with a separately authorized
`wrangler deploy` of the exact verified CI archive, secure `--secrets-file`, and
full maintenance/write-freeze controls. Follow the
[Durable Object lifecycle runbook](../../docs/operations/cloudflare-durable-object-lifecycle.md)
and do not set a resource-ready marker until its remote check passes.

After the Worker exists at the final checked-in lifecycle tag, configure or
rotate runtime secrets and complete the D1 transition for the explicit target:

```bash
test -n "${CLOUDFLARE_ACCOUNT_ID:-}"
test -n "${CLOUDFLARE_API_TOKEN:-}"
pnpm managed-cloud:do-lifecycle -- --identity production
pnpm --filter @litemcp/managed-cloud exec wrangler whoami
pnpm managed-cloud:do-lifecycle -- --env production
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put BETTER_AUTH_SECRET --env=
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put CREDENTIAL_MASTER_KEY --env=
pnpm --filter @litemcp/managed-cloud db:migrate:remote
```

Next, bind an account-owned route or custom domain and make `PUBLIC_ORIGIN` and
`WEB_ORIGINS` in `wrangler.jsonc` match that exact HTTPS origin. The checked-in
origin must not be paired with an unrelated `workers.dev` deployment. Only
then apply the reviewed trigger configuration and deploy traffic:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler triggers deploy --env=
# Then use the exact-CI-artifact staging and production workflows.
```

Wrangler `versions upload`/`versions deploy` does not create or update routes,
custom domains, or cron triggers. Treat trigger deployment as a separate
reviewed mutation and verify the account route, DNS/TLS, and exact public origin before setting
`MANAGED_CLOUD_RESOURCES_READY=true`. That marker also attests that the active
Worker has the final checked-in Durable Object migration tag and bindings. The
workflow verifies the lifecycle state through a read-only Cloudflare settings
lookup before every version upload.

The checked-in workflow is a customer-owned reference, not the deployment path
for LiteMCP's operated service. To use it in a fork, configure the GitHub
`managed-cloud` environment with distinct `CLOUDFLARE_MIGRATION_API_TOKEN` and
`CLOUDFLARE_DEPLOY_API_TOKEN` secrets plus `CLOUDFLARE_ACCOUNT_ID` and
`MANAGED_CLOUD_URL`,
`MANAGED_CLOUD_RESOURCES_READY=true`, and the authenticated MCP smoke variables.
Production is dispatch-only. Set repository variable
`CUSTOMER_OWNED_REFERENCE_DEPLOY=true` only after reviewing the composition for
your account. Its always-running preflight fails the dispatch when that opt-in
or the main-branch control ref is absent; later gates fail on a missing
resource-ready marker, exact origin, CI/staging evidence, or smoke tuple.
Configure required reviewers and protected deployment branches on the
`managed-cloud` GitHub environment before enabling it; declaring the environment
in YAML does not create those remote protections. Scope the migration token to
D1 read/write only and the deploy token to Worker version/static-asset upload
and traffic deployment plus Worker-settings read only; the workflow rejects
equal token values. Do not widen either token for Durable Object lifecycle
authority. That separately reviewed operation uses a short-lived operator
credential and the exact CI archive. Static assets and the Worker bundle are
built without credentials in the exact CI run, retained with a SHA-256
manifest, and uploaded later with `--no-bundle`.

While Better Auth migration `0003_better_auth_1_7_scim.sql` is pending, the
environment must also attest a real SCIM/auth write freeze with
`SCIM_WRITES_FROZEN=true` and bind approval to the exact candidate using
`BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA=<full SHA>`. The preflight ignores those
temporary attestations after the migration is recorded as applied.

## Isolated staging target

`wrangler.jsonc` defines a named `staging` environment with a separate Worker
name, custom domain, KV namespace, D1 database, Durable Object namespace, and
non-demo variables. Wrangler does not inherit variables or bindings into named
environments, so each staging binding is repeated intentionally. Production
commands pass an explicit empty environment (`--env=`); staging commands pass
`--env staging`, which prevents an omitted flag from silently selecting the
wrong target.

The checked-in staging KV and D1 bindings deliberately begin without resource
IDs. Create those resources explicitly, record the account-owned IDs in
`env.staging`, and review the resulting diff. The lifecycle config writer and
identity check refuse missing, malformed, cross-target, or account-inaccessible
IDs. For a brand-new empty D1 database, apply all checked-in D1 migrations and
verify the upgraded fingerprint before the first Worker deploy; an existing
legacy target instead uses maintenance/write freeze and the read-only preflight.
Then apply the first Worker and both checked-in Durable Object migrations from
the verified staging CI payload using the lifecycle runbook; a first
`versions upload` is not supported:

```bash
node scripts/check-managed-cloud-wrangler.mjs --require-staging-resource-ids
pnpm managed-cloud:do-lifecycle -- --identity staging
# Complete exactly one of the new-target/existing-target D1 sequences, then
# apply and verify the exact CI staging Worker payload as documented in:
# docs/operations/cloudflare-durable-object-lifecycle.md
pnpm managed-cloud:do-lifecycle -- --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put BETTER_AUTH_SECRET --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put CREDENTIAL_MASTER_KEY --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler triggers deploy --env staging
```

Run the trigger command only after replacing the staging resource IDs and
reviewing the exact account-owned route/custom domain and origins. Confirm the
remote lifecycle tag/bindings, DNS/TLS, and public reachability before setting
`MANAGED_CLOUD_STAGING_RESOURCES_READY=true`; automated version promotion
intentionally does not mutate triggers.

The customer-owned `managed-cloud-staging` GitHub environment then needs
distinct `CLOUDFLARE_MIGRATION_API_TOKEN`, `CLOUDFLARE_DEPLOY_API_TOKEN`, and
`CLOUDFLARE_ACCOUNT_ID` secrets plus
`MANAGED_CLOUD_STAGING_URL`, `MANAGED_CLOUD_STAGING_RESOURCES_READY=true`, and
the authenticated MCP endpoint/token/tool tuple. Repository variable
`MANAGED_CLOUD_STAGING_AUTO_DEPLOY=true` enables automation; repository variable
`CUSTOMER_OWNED_REFERENCE_DEPLOY=true` is the shared opt-in. A green `main` CI
run can deploy staging only after all gates and the checked-in
resource-ID/origin checks pass. Manual staging dispatches fail explicitly when
the shared opt-in is absent; automatic runs remain intentionally skipped until
the staging auto flag is enabled. Configure reviewers and deployment-branch
policies independently on `managed-cloud-staging` and `managed-cloud`; they are
not present in the current upstream repository.

Each deployment uploads the verified CI archive as a uniquely tagged Worker
version, deploys by the parsed UUID, verifies that the latest deployment sends
100% of traffic to that UUID, and records the target, archive hash, migration
set, CI/deployment attempts, URL, and smoke results. Production and staging have
separate archives because their public origins and bindings differ; both are
built once by the same exact CI run.

The resource-ready markers also attest that the separately managed route/custom
domain triggers still match the checked-in target and that the active Worker is
at the final checked-in Durable Object migration tag. If either lifecycle or
trigger configuration changes, stop automation, apply and verify it as its own
reviewed mutation, then re-enable the marker. The promotion workflows perform a
credentialed read-only lifecycle check before any version upload.

## Signup and email gate

Both targets check in with `SIGNUPS_ENABLED=false`. Before enabling signup for
one target, configure and verify its email delivery values without committing
them:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put RESEND_API_KEY --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put EMAIL_FROM --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put EMAIL_REPLY_TO --env staging
```

`EMAIL_REPLY_TO` is optional. To enable signup, change that target's
`SIGNUPS_ENABLED` to `true` and add `RESEND_API_KEY` and `EMAIL_FROM` to its
`secrets.required` list in the same reviewed change. The configuration check
rejects an enabled target that does not declare both. Repeat with `--env=` only
after staging email verification passes. Managed-cloud build scripts pass the
selected Wrangler target's signup value and public origin into Astro, keeping
the rendered login UI aligned with the Worker runtime.

## Error tracking

Sentry is an optional, operator-enabled integration in this customer-owned
reference. Without `SENTRY_DSN`, the SDK is disabled and emits no Sentry events;
authentication, authorization, audit, analytics, and MCP execution continue
locally. To opt in for one explicit target, add the secret without committing
its value:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put SENTRY_DSN --env staging
# Use --env= for the separately reviewed production target.
```

When enabled, the Worker SDK captures uncaught runtime failures and
control-plane exceptions that Hono converts into safe 500 responses. It tags
only the generated request ID, route pathname, method, and checked-in
environment name; default personally identifying data and tracing are disabled.
Cloudflare Workers observability remains enabled in the account-owned platform
for native logs and metrics. Configure any Sentry alert and notification target
in the operator's project; neither a DSN nor an external alert is required by
the public product.

## Deployment smoke

Every deployment runs the public site, health, and readiness checks. To add an
authenticated data-plane check, configure all of these values in the matching
GitHub environment:

| Value | GitHub storage | Purpose |
| --- | --- | --- |
| `MANAGED_CLOUD_MCP_TOKEN` | Secret | Short-lived token for a dedicated smoke session |
| `MANAGED_CLOUD_MCP_ENDPOINT` | Variable | Exact same-origin `/mcp/...` endpoint |
| `MANAGED_CLOUD_MCP_TOOL_NAME` | Variable | Explicit tool that advertises `readOnlyHint=true` |
| `MANAGED_CLOUD_MCP_TOOL_ARGUMENTS_JSON` | Variable | JSON object for the read-only call; defaults to `{}` |

Staging uses the same names with the `MANAGED_CLOUD_STAGING_` prefix. The smoke
script rejects cross-origin endpoints, partial configuration, non-read-only
tools, JSON-RPC errors, and failed tool results. It never creates a session;
the short-lived token must be issued and rotated through a separately accepted
identity/control-plane path.

Deployment is not complete until the D1 and Durable Object migrations, Worker,
static site, API, authentication, and a scoped MCP session have passed smoke
tests. KV-backed non-authoritative records remain eventually consistent, and
the current managed service still has the limits described in
[`../../docs/known-limitations.md`](../../docs/known-limitations.md).

## Important files

- `wrangler.jsonc` — isolated Worker targets, assets, KV, D1, Durable Objects,
  variables, and required secrets.
- `src/index.ts` — Cloudflare composition root.
- `migrations/` — Better Auth D1 schema.
- `scripts/print-auth-migration.ts` — reproducible auth migration generator.
- `../../docs/operations/cloudflare-durable-object-lifecycle.md` — first-deploy
  and lifecycle-change boundary for exact CI payloads.
