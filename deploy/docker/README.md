# Container images

This directory contains the production container definitions used by the
self-hosted distribution.

| File | Purpose |
| --- | --- |
| `server.Dockerfile` | Builds the portable Node.js control plane and MCP gateway, then runs it as the unprivileged `node` user. |
| `web.Dockerfile` | Builds the Astro application and serves the static output with unprivileged Nginx. |
| `web.nginx.conf` | Runtime template that serves the console and proxies API, auth, and MCP traffic to the configured server upstream. |

Both images use multi-stage builds and contain only the runtime output needed
by the final container. The Compose and Helm distributions add the database,
configuration, health checks, networking, and security context around them.

## Build locally

Run these commands from the repository root:

```bash
docker build -f deploy/docker/server.Dockerfile -t litemcp-server:local .
docker build -f deploy/docker/web.Dockerfile -t litemcp-web:local .
```

For a complete local stack, use the [Docker Compose
guide](../docker-compose/README.md). For Kubernetes, use the [Helm
chart](../helm/litemcp/README.md).
