# Development guide

## Prerequisites

- Node.js 22.12 or newer;
- pnpm 10.30.2 through Corepack;
- Docker and Helm for deployment validation;
- Wrangler only for managed cloud work;
- optional `kubectl` and `kind` for a real local Kubernetes smoke.

Install exactly from the lockfile:

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Workspace map

```text
apps/web                 Astro public site and React console
apps/managed-cloud       Managed cloud deployment, currently on Cloudflare
apps/server              Portable Node deployment for Docker/Kubernetes
packages/contracts       Shared schemas and public domain types
packages/storage         Portable tenant-scoped NoSQL store contract
packages/adapter-*       Infrastructure storage/runtime adapters
packages/auth            Better Auth composition
packages/core            Portable domain behavior and policy
packages/mcp-gateway     Portable MCP data plane
packages/platform-api    Shared Hono control plane and MCP routes
packages/sdk-*           TypeScript and Python clients
packages/cli             Operational command-line client
deploy                   Docker Compose, images, Helm, and runbooks
examples                 Runnable public-interface examples
```

## Architectural dependency rule

Portable packages may depend on contracts, Web APIs, and explicit ports. They
must not import Cloudflare bindings, Node server assembly, Docker, or Kubernetes
APIs. Provider-specific code belongs in the deployment app or adapter:

- `apps/managed-cloud`: product deployment name;
- `apps/server`: portable Node composition root;
- `packages/adapter-cloudflare`: provider infrastructure adapter.

Do not rename Wrangler configuration, Cloudflare bindings, or the adapter when
the provider name is technically necessary.

## Local workflow

Start the explicit demo server and site together:

```bash
LITEMCP_DEMO_MODE=true pnpm dev
```

Open `http://localhost:4321`. The demo exposes only deterministic `org_demo`
data and must not be reachable from an untrusted network.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm types
pnpm test
pnpm build
```

The root build includes every package, the Astro site, Node server, examples,
and the managed cloud Wrangler dry-run bundle.

Deployment configuration checks:

```bash
docker compose -f deploy/docker-compose/compose.yaml config
docker build --check -f deploy/docker/server.Dockerfile .
docker build --check -f deploy/docker/web.Dockerfile .
helm lint --strict deploy/helm/litemcp
helm template litemcp deploy/helm/litemcp
bash -n scripts/*.sh
python3 -m compileall -q packages/sdk-python/src
```

## Adding a domain capability

1. Add or update the schema in `@litemcp/contracts`.
2. Add portable behavior and tenant checks in `@litemcp/core`.
3. Add policy and audit transitions before side effects.
4. Add API validation/authorization in `@litemcp/platform-api`.
5. Extend the MCP gateway only when the capability is a data-plane concern.
6. Add SDK/CLI/UI access through public APIs, not private package imports.
7. Add positive, negative, cross-tenant, revocation, and failure-path tests.
8. Update feature reference, limitations, implementation status, and OpenAPI.
9. Validate both managed cloud and portable builds.

## Adding a storage adapter

Implement `DocumentStore` and report real consistency capabilities. Test:

- tenant-qualified identity and rejection of cross-tenant access;
- cursor listing and stable ordering;
- create/update conflict behavior;
- revision expectations;
- deletion semantics;
- concurrency and failure recovery;
- serialization and index/migration behavior.

Do not emulate atomic compare-and-swap with a non-atomic read/write sequence and
then advertise it as strong consistency.

## Adding an MCP executor

An executor must define transport matching, time/size/concurrency bounds,
cancellation, response validation, secret boundaries, retry safety, provenance,
and audit behavior. Network executors must address redirects, DNS rebinding,
special IP ranges, Host/SNI, proxy behavior, and provider authentication. Local
process/container executors require a disposable sandbox; an allowlist alone is
not isolation.

## Security review checklist

- Is tenant identity derived from trusted context?
- Can a user influence roles, groups, organization, or session subject?
- Does explicit deny win and is policy repeated at execution?
- Are schemas bounded and isolated per request/tenant?
- Can credentials enter URLs, logs, audit metadata, exports, or client output?
- Does a side effect occur before authorization, approval, or pre-dispatch audit?
- Can a completed side effect be retried accidentally?
- Does logout/deprovision/revocation invalidate existing access within a known bound?
- Does storage consistency match the security decision being made?
- Are demo and unsafe execution features off by default and visibly named?

Read [`security/threat-model.md`](./security/threat-model.md) before changing an
identity, policy, credential, network, sandbox, or audit boundary.

## Documentation rule

Document current behavior separately from target design. Use the availability
labels in [`feature-reference.md`](./feature-reference.md), add a reproducible
test/build link for an “available” claim, and keep
[`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) plus
[`known-limitations.md`](./known-limitations.md) synchronized.
