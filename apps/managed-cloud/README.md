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

On a fresh account, upload an inactive version first so Wrangler can provision
the draft KV and D1 bindings without sending traffic to an unmigrated database:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler login
pnpm --filter @litemcp/managed-cloud exec wrangler whoami
pnpm --filter @litemcp/managed-cloud build:web
pnpm --filter @litemcp/managed-cloud exec wrangler versions upload --env=
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put BETTER_AUTH_SECRET --env=
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put CREDENTIAL_MASTER_KEY --env=
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put SENTRY_DSN --env=
pnpm --filter @litemcp/managed-cloud db:migrate:remote
```

Next, bind an account-owned route or custom domain and make `PUBLIC_ORIGIN` and
`WEB_ORIGINS` in `wrangler.jsonc` match that exact HTTPS origin. The checked-in
origin must not be paired with an unrelated `workers.dev` deployment. Only
then deploy traffic:

```bash
pnpm managed-cloud:deploy
```

The checked-in workflow is a customer-owned reference, not the deployment path
for LiteMCP's operated service. To use it in a fork, configure the GitHub
`managed-cloud` environment with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets plus `MANAGED_CLOUD_URL`,
`MANAGED_CLOUD_RESOURCES_READY=true`, and optionally
`MANAGED_CLOUD_AUTO_DEPLOY=true` variables. Set
`CUSTOMER_OWNED_REFERENCE_DEPLOY=true` only after reviewing the composition for
your account. The workflow refuses to run when that opt-in, the resource-ready
marker, or the exact origin match is absent.

## Isolated staging target

`wrangler.jsonc` defines a named `staging` environment with a separate Worker
name, custom domain, KV namespace, D1 database, Durable Object namespace, and
non-demo variables. Wrangler does not inherit variables or bindings into named
environments, so each staging binding is repeated intentionally. Production
commands pass an explicit empty environment (`--env=`); staging commands pass
`--env staging`, which prevents an omitted flag from silently selecting the
wrong target.

The checked-in staging KV and D1 bindings deliberately begin without resource
IDs. Bootstrap them with an inactive upload, record the account-owned IDs in
`env.staging`, and review the resulting diff before enabling automation:

```bash
pnpm --filter @litemcp/managed-cloud build:web:staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions upload --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put BETTER_AUTH_SECRET --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put CREDENTIAL_MASTER_KEY --env staging
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put SENTRY_DSN --env staging
pnpm --filter @litemcp/managed-cloud db:migrate:staging
node scripts/check-managed-cloud-wrangler.mjs --require-staging-resource-ids
```

The customer-owned `managed-cloud-staging` GitHub environment then needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets plus
`MANAGED_CLOUD_STAGING_URL`, `MANAGED_CLOUD_STAGING_RESOURCES_READY=true`, and
optionally `MANAGED_CLOUD_STAGING_AUTO_DEPLOY=true` variables, plus the same
`CUSTOMER_OWNED_REFERENCE_DEPLOY=true` opt-in. A green `main` CI run can deploy
staging only after all of those gates and the checked-in resource-ID/origin
checks pass. Production remains a separate protected environment and workflow.

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

Both managed targets require `SENTRY_DSN`. The Worker SDK captures uncaught
runtime failures and control-plane exceptions that Hono converts into safe 500
responses. It tags only the generated request ID, route pathname, method, and
the checked-in environment name; default personally identifying data is
disabled. Cloudflare Workers observability remains enabled for native logs and
metrics. Configure the error-rate alert and its notification target in the
Sentry project before promoting either target; alert configuration is external
deployment evidence and is not implied by the checked-in DSN binding.

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
