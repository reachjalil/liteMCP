# Docker Compose deployment

This stack is the shortest path to a customer-operated LiteMCP Composer environment. It
runs the Astro console, the portable Node.js control plane and MCP gateway, and
a single-node MongoDB replica set for revision-safe writes and transactions.

## Start the stack

From the repository root:

```bash
cp deploy/docker-compose/.env.example deploy/docker-compose/.env
openssl rand -base64 48
```

Put the generated value in `BETTER_AUTH_SECRET`, then start the services:

```bash
docker compose --env-file deploy/docker-compose/.env \
  -f deploy/docker-compose/compose.yaml up --build
```

The console is available at [http://localhost:8080](http://localhost:8080), and
the API health endpoint is available at
[http://localhost:8787/health](http://localhost:8787/health).

## What the stack enforces

- MongoDB is isolated on the internal backend network.
- The server and web filesystems are read-only with bounded temporary storage.
- Containers run without root privileges and with `no-new-privileges`.
- Startup and health checks gate service dependencies.
- Product demo mode is disabled.

The included topology is appropriate for evaluation and development. A
production deployment still needs managed secrets, TLS at the ingress,
backups, monitoring, and a highly available MongoDB replica set. See the
[on-premises installation guide](../../docs/on-prem/installation.md) and [known
limitations](../../docs/known-limitations.md) before production use.

## Stop the stack

```bash
docker compose --env-file deploy/docker-compose/.env \
  -f deploy/docker-compose/compose.yaml down
```

MongoDB data remains in the named volume. Add `--volumes` only when you
intentionally want Docker Compose to delete that local data.
