# Portable server

The server is the Node.js composition root for Docker, Kubernetes, private
cloud, and local enterprise deployments. It exposes the same Hono management
API and MCP gateway used by the managed cloud.

## Runtime choices

- MongoDB is the production `DocumentStore` and Better Auth persistence layer.
- The in-memory store is available only for an explicitly enabled local demo or
  `LITEMCP_INSECURE_DEV=true`; both modes bind to loopback by default.
- Remote HTTP execution uses bounded, redirect-free outbound requests.
- Host stdio execution is disabled unless an operator sets both
  `LITEMCP_ENABLE_UNSAFE_HOST_STDIO=true` and an exact
  `LITEMCP_STDIO_ALLOWLIST`; production connector execution belongs in an
  isolated runner.

## Usage analytics

The Insight Plane is opt-in with `ANALYTICS_ENABLED=true`. When enabled, local
demo and insecure-development runtimes use the in-memory analytics store;
MongoDB deployments use the `usage_events` time-series collection for both
fail-open event recording and tenant-scoped analytics queries. Analytics
records contain bounded metadata only, never tool arguments or results.

Mongo batching and retention can be tuned with:

- `ANALYTICS_RETENTION_DAYS` — integer from 1 through 3650; default `90`.
- `ANALYTICS_MAX_QUEUE_SIZE` — integer from 1 through 100000; default `10000`.
- `ANALYTICS_BATCH_SIZE` — integer from 1 through 1000; default `250`.
- `ANALYTICS_FLUSH_INTERVAL_MS` — integer from 0 through 60000; default `100`.

Self-hosted resource limits default to effectively unlimited. Operators may set
finite, deployment-local guardrails with `LITEMCP_QUOTA_SERVERS`,
`LITEMCP_QUOTA_COMPOSITIONS`, `LITEMCP_QUOTA_ACTIVE_SESSIONS`, and
`LITEMCP_QUOTA_TOOL_CALLS_PER_DAY`. No quota value is fetched from a license,
billing, telemetry, or LiteMCP-operated service.

Invalid values fail configuration before the server connects to external
services. Once configured, analytics setup, write, and flush failures are
reported but cannot fail product requests or prevent shutdown. Graceful
shutdown first drains HTTP requests, then recorder work and the analytics
batch, and finally closes MongoDB. With analytics disabled, the exact usage
standing endpoint remains available while analytics query endpoints return an
unavailable response.

## Development

```bash
LITEMCP_DEMO_MODE=true pnpm --filter @litemcp/server dev
```

The explicit demo binds to loopback by default and exposes only `org_demo`.
`LITEMCP_INSECURE_DEV=true` is a separately named escape hatch for local work
without MongoDB/authentication. Production mode fails at startup without
MongoDB and a strong `BETTER_AUTH_SECRET`.

## Production entry point

```bash
pnpm --filter @litemcp/server build
MONGODB_URI='mongodb://...' \
BETTER_AUTH_SECRET='at-least-32-random-characters' \
API_ORIGIN='https://litemcp.example.com' \
WEB_ORIGIN='https://litemcp.example.com' \
SIGNUPS_ENABLED=false \
ANALYTICS_ENABLED=true \
LITEMCP_DEMO_MODE=false \
node apps/server/dist/index.js
```

Before setting `SIGNUPS_ENABLED=true`, configure both `RESEND_API_KEY` and
`EMAIL_FROM` (plus optional `EMAIL_REPLY_TO`). The runtime refuses to open
production registration without email delivery.

For packaged deployments, use `deploy/docker-compose` or
`deploy/helm/litemcp`; they configure non-root containers, health probes, and
production demo-mode defaults.

## Important files

- `src/runtime.ts` — storage, auth, executor, API, and gateway assembly.
- `src/index.ts` — HTTP lifecycle and graceful shutdown.
- `src/stdio-executor.ts` — explicitly unsafe evaluation adapter; not a sandbox.
