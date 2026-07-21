# Portable server

The server is the Node.js composition root for Docker, Kubernetes, private
cloud, and local enterprise deployments. It exposes the same Hono management
API and MCP gateway used by the managed cloud.

## Runtime choices

- MongoDB is the production `DocumentStore` and Better Auth persistence layer.
- The in-memory store is available only for an explicitly enabled local demo.
- Remote HTTP execution uses bounded, redirect-free outbound requests.
- Host stdio execution is disabled unless an operator sets both
  `LITEMCP_ENABLE_UNSAFE_HOST_STDIO=true` and an exact
  `LITEMCP_STDIO_ALLOWLIST`; production connector execution belongs in an
  isolated runner.

## Development

```bash
LITEMCP_DEMO_MODE=true pnpm --filter @litemcp/server dev
```

The explicit demo binds to loopback by default and exposes only `org_demo`.
Production mode requires MongoDB and a strong `BETTER_AUTH_SECRET`.

## Production entry point

```bash
pnpm --filter @litemcp/server build
MONGODB_URI='mongodb://...' \
BETTER_AUTH_SECRET='at-least-32-random-characters' \
API_ORIGIN='https://litemcp.example.com' \
WEB_ORIGIN='https://litemcp.example.com' \
LITEMCP_DEMO_MODE=false \
node apps/server/dist/index.js
```

For packaged deployments, use `deploy/docker-compose` or
`deploy/helm/litemcp`; they configure non-root containers, health probes, and
production demo-mode defaults.

## Important files

- `src/runtime.ts` — storage, auth, executor, API, and gateway assembly.
- `src/index.ts` — HTTP lifecycle and graceful shutdown.
- `src/stdio-executor.ts` — explicitly unsafe evaluation adapter; not a sandbox.
