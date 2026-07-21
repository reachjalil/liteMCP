# Managed cloud

This app is the managed cloud deployment of LiteMCP Composer. It currently uses
Cloudflare, but it composes the same auth, control-plane, gateway, policy, and
domain packages used by the self-hosted server.

## Responsibilities

- Serve the built Astro site and console through Workers Static Assets.
- Run the Hono control-plane API and MCP gateway in a Worker.
- Store product projections in Workers KV through `adapter-cloudflare`.
- Store Better Auth records separately in D1.
- Apply the checked-in D1 migration and bind runtime secrets through Wrangler.

Cloudflare-specific bindings stop here. Portable packages must not import
Cloudflare runtime APIs.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm --filter @litemcp/managed-cloud db:migrate:local
pnpm managed-cloud:dev
```

Copy `.dev.vars.example` to `.dev.vars` for local-only values. Never commit
`.dev.vars`, authentication secrets, provider tokens, or generated Wrangler
state.

## Deployment

On a fresh account, upload an inactive version first so Wrangler can provision
the draft KV and D1 bindings without sending traffic to an unmigrated database:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler login
pnpm --filter @litemcp/managed-cloud exec wrangler whoami
pnpm --filter @litemcp/web build
pnpm --filter @litemcp/managed-cloud exec wrangler versions upload
pnpm --filter @litemcp/managed-cloud exec wrangler versions secret put BETTER_AUTH_SECRET
pnpm --filter @litemcp/managed-cloud db:migrate:remote
```

Next, bind an account-owned route or custom domain and make `PUBLIC_ORIGIN` and
`WEB_ORIGINS` in `wrangler.jsonc` match that exact HTTPS origin. The checked-in
origin must not be paired with an unrelated `workers.dev` deployment. Only
then deploy traffic:

```bash
pnpm managed-cloud:deploy
```

For continuous deployment after this one-time bootstrap, configure the GitHub
`managed-cloud` environment with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets plus `MANAGED_CLOUD_URL`,
`MANAGED_CLOUD_RESOURCES_READY=true`, and optionally
`MANAGED_CLOUD_AUTO_DEPLOY=true` variables. The workflow refuses to run when
the resource-ready marker or exact origin match is absent.

Deployment is not complete until the D1 migration, Worker, static site, API,
authentication, and a scoped MCP session have passed smoke tests. KV is
eventually consistent; security-sensitive multi-writer production mutations
still require the serialized boundary described in
[`../../docs/known-limitations.md`](../../docs/known-limitations.md).

## Important files

- `wrangler.jsonc` — Worker, assets, KV, D1, variables, and required secrets.
- `src/index.ts` — Cloudflare composition root.
- `migrations/` — Better Auth D1 schema.
- `scripts/print-auth-migration.ts` — reproducible auth migration generator.
