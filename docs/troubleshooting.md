# Troubleshooting

Start with the first failing layer. Preserve request IDs and redact all secrets
before sharing diagnostics.

## Installation and workspace

### Frozen install fails

```bash
corepack enable
pnpm --version
node --version
pnpm install --frozen-lockfile
```

Use Node 22.12+ and pnpm 10.30.2. If `package.json` changed intentionally, run a
normal install once to update `pnpm-lock.yaml`, review the diff, and then repeat
the frozen install.

### Root development ports conflict

The supported root demo should run only the portable Node server and Astro web
app. Run the managed cloud Worker separately with `pnpm managed-cloud:dev`.
Stop Docker Compose before using the same local ports, or change the relevant
published/listen ports explicitly.

### Astro reports another server is running

Use the status/stop commands printed by Astro, or verify the existing
`http://localhost:4321` process before starting another instance. Avoid killing
unrelated processes by broad name matching.

## Control plane

### `/health` succeeds but `/ready` fails

This is expected when the process is alive but production dependencies are not
safe. Check:

- `LITEMCP_DEMO_MODE` is false in production;
- `MONGODB_URI` connects and indexes can be created;
- `BETTER_AUTH_SECRET` is present and strong;
- public and web origins are exact;
- the store readiness read succeeds.

Do not route traffic using `/health` alone.

### API returns 401

In production, sign in and select an active organization. In explicit local
demo mode only, send `X-LiteMCP-Tenant: org_demo` and a supported demo role.

### API returns 403 Membership Required

The session lacks an active organization or membership role. Confirm the active
organization ID, membership record, and Better Auth organization state. Demo
headers do not override production membership.

### API returns 422 for an upstream endpoint

Use a credential-free absolute HTTP(S) URL. Remove userinfo, query parameters,
fragment, malformed percent encoding, and credential-shaped path segments.
Authentication will belong in a credential profile when that feature ships.

## MCP gateway

### Session tenant does not match endpoint

Use exactly the endpoint returned with the session. Do not edit the organization
or composition segment, and do not reuse a token across tenants.

### Session is rejected

Check expiry, explicit revoke, organization, published composition, and target
environment. Create a new short-lived session rather than extending or copying
an expired token.

### A tool is missing from `tools/list`

Verify the composition is published, the member/version exists, the namespace
and alias are correct, and `discover` policy allows the current subject/tool
risk. Missing tools are often intentional policy filtering.

### A listed tool is denied at `tools/call`

Execution repeats policy. Inspect policy version/context, risk, approval state,
session age, and any change since discovery. This is a security property, not a
client cache guarantee.

### Invalid params

Compare arguments with the exact schema returned by `tools/list`. Unknown,
missing, badly formatted, or out-of-range fields are rejected before approval
and upstream dispatch.

### Remote upstream timeout or network error

Check approved DNS answers, destination IP class, TLS/Host/SNI, redirect
behavior, egress policy, `UPSTREAM_TIMEOUT_MS`, and
`UPSTREAM_MAX_RESPONSE_BYTES`. Production blocks private/special addresses.
Do not enable demo/private-network behavior to work around a production routing
problem.

### Stdio server never starts

Host stdio is disabled by default. It requires both the unsafe opt-in and exact
allowlist, and still is not production-safe. Prefer remote HTTP or implement a
reviewed disposable sandbox.

## Managed cloud

### Wrangler is not found from the repository root

Wrangler is scoped to the managed cloud package:

```bash
pnpm --filter @litemcp/managed-cloud exec wrangler --version
pnpm --filter @litemcp/managed-cloud exec wrangler whoami
```

### Remote D1 migration cannot find `AUTH_DB`

A fresh Cloudflare account must provision/configure the declared D1/KV
resources before migration. Follow the managed cloud bootstrap sequence and
confirm the binding in the target environment. Do not run a public Worker
against an unmigrated auth database.

### Wrangler dry run succeeds but the site is unavailable

A dry run only proves bundling. It does not create resources, bind a domain,
apply remote migrations, configure secrets, or run deployed smoke tests.

### Live deploy is unauthenticated

Run filtered `wrangler login` or configure an API token/account ID in the CI
environment. Never paste the token into repository files or terminal output
that will be shared.

## Docker and Kubernetes

### Compose renders but services are unhealthy

Inspect Mongo replica-set initialization, server `/ready`, secret values, exact
origins, volume permissions, and reverse-proxy upstream. Rendering validates
configuration syntax, not the product journey.

### Helm lints but a pod CrashLoops

Inspect pod events and logs, image architecture/pull credentials, mounted
Secrets/ConfigMaps, Mongo reachability, read-only filesystem paths, DNS,
NetworkPolicy, and generated service names. A template render cannot prove
runtime DNS or network behavior.

### Web loads but API calls fail

Confirm the static proxy points to the release-qualified server Service, the web
pod can resolve DNS and egress to that Service, CORS/trusted origins match, and
Ingress routes `/api`, `/auth`, `/mcp`, `/health`, and `/ready` as designed.

### Readiness never becomes green

Test the server Service directly inside the cluster, then verify Mongo and auth
configuration. Keep liveness on `/health` and readiness/startup on `/ready`.

## Audit and incident diagnostics

### Audit sequence/hash discontinuity

Stop sensitive changes, preserve database/application evidence, and determine
whether a storage crash or multi-writer race interrupted the event/head update.
Mongo audit writes are not fully transactional and Workers KV is not a strong
multi-writer audit authority today.

### Sensitive data appears in diagnostics

Stop sharing the bundle, revoke/rotate the exposed credential, remove the unsafe
artifact from distribution, and preserve a restricted incident copy if needed.
Redaction filters are defense in depth; producers must never log secrets.

## Getting help

Run relevant checks and include:

- release/commit and target deployment;
- exact failing command or route;
- request ID;
- redacted problem response/logs;
- expected versus actual behavior;
- whether demo mode or unsafe stdio was enabled;
- the smallest safe reproduction.

Report security issues privately according to [`../SECURITY.md`](../SECURITY.md).
