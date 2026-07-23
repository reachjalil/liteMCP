# Pattern decisions

Status: accepted design decisions. Each decision remains subject to
implementation evidence and may be changed through an ADR.

## Decision principles

- Prefer target-repository conventions once they exist, then documented
  reference patterns, then conservative defaults.
- Keep the cloud and Kubernetes deployments on one source and release train.
- Treat security, export, observability, and on-premises operation as product
  capabilities, not licensed extensions.
- Choose replaceable infrastructure and explicit contracts over provider
  convenience in domain code.
- Make unsafe consistency or fallback behavior visible and fail closed.

## Adopt

### pnpm, Turbo, strict ESM TypeScript

Use pnpm workspaces, a centralized catalog, `workspace:*` internal dependencies,
Turbo task orchestration, Node.js 22 or newer, ESM, and strict TypeScript in
every package. The reference is productive here, but application-specific
strictness exceptions will not be copied.

### Astro with focused React islands

Use Astro for both the public site and console. Ship static HTML/assets where
possible and hydrate React only for interactive workbench regions. This meets
the product constraint and retains the reference's component ecosystem without
turning the console into an undifferentiated SPA.

### Hono and Web-standard service contracts

Use Hono for control-plane, gateway, and worker HTTP entrypoints. Portable
handlers depend on Web APIs, typed environment contracts, Zod schemas, and
generated OpenAPI. Cloudflare Worker and Node container entrypoints are thin
composition roots.

### Dense enterprise workbench visual language

Adopt the reference's compact navigation, panel registration, tabs, inspector,
status bar, sharp surfaces, restrained effects, semantic OKLCH color tokens,
Geist typography, Tailwind 4, and accessible Base UI-style primitives. Adapt
the information architecture to organizations, MCP servers, skills,
compositions, endpoints, connections, policy, approvals, audit, and operations.

### Idempotency, journal, and outbox

Carry forward the reference's useful usage-ledger idempotency and documented
mutation-journal concepts. Every externally retried mutation receives an
idempotency record; state transitions that emit events use an outbox or an
adapter-equivalent atomic operation.

### Package and release hygiene

Adopt explicit public exports, tarball smoke tests, dependency/license audits,
Changesets, npm provenance, SBOMs, signed release metadata, and distinct edge,
stable, and LTS channels.

## Adapt

### Better Auth

Use Better Auth for application authentication and browser sessions, created
per environment/request with strict trusted origins and explicit migrations.
Persist it in D1 on Cloudflare and MongoDB on Kubernetes. Add a portable
identity service for organizations, enterprise IdP mappings, roles, groups,
SCIM, service principals, and scoped API tokens.

Better Auth session success does not imply authorization. The Hono API and MCP
gateway evaluate organization membership and policy on every protected action.
Any Better Auth plugin used for SSO must be license-compatible, self-hostable,
air-gap capable, and replaceable. Until verified, enterprise SSO remains a
LiteMCP Composer-owned standards integration behind an adapter.

### Cloudflare storage

Use KV as the initial product `DocumentStore` adapter and explicitly expose its
eventual consistency. Do not repeat the reference's independent multi-key KV
writes for membership or access state. Serialize security-sensitive tenant
mutations through Durable Objects before production readiness, publish
immutable versions, and project read models to KV.

D1 is reserved for Better Auth in the selected architecture; it is not a hidden
relational dependency of the portable product domain. R2 stores artifacts and
exports, and Queues dispatch outbox work.

### Kubernetes storage

Use a MongoDB replica set as the production `DocumentStore` and Better Auth
backend, with separate logical ownership. Require transactions for multi-record
security mutations, unique idempotency/event indexes, change-stream or polling
outbox recovery, documented index migration, backup, point-in-time recovery,
upgrade, and restore tests.

### Service-to-service claims

Retain short-lived signed claims but add exact audience, route, method, body
digest, expiry, and nonce binding. Reject claims outside a tight clock window
and store replay identifiers for sensitive operations.

### Testing

Use Vitest, the Cloudflare Workers test pool, and Playwright patterns, extending
them to MongoDB integration, MCP conformance, tenant isolation, OAuth/SCIM,
policy list-versus-call behavior, export/import, containers, Helm, upgrade, and
air-gap smoke tests. Accessibility rules are gates, not optional lint.

## Reject

### Product feature gates and self-host license enforcement

The research package's closed enterprise controls conflict with the open-product
boundary. LiteMCP Composer will not require a license server, hosted entitlement
check, or proprietary package to operate the self-hosted product. The separate
operated service may include checkout, usage billing, hosted plans, customer
lifecycle management, and service-specific entitlements. Revenue may also come
from installation, migration, supported LTS, security response, training, and
contractual support or assurance.

### Static-key credential encryption

Reject the reference's single static derived AES key. Credentials require
tenant-bound envelope encryption, key IDs and versions, authenticated context,
rotation, short-lived execution grants, and Vault/KMS adapters. Administrators
must not be able to retrieve plaintext merely because they are administrators.

### Cloudflare types in core packages

Reject `cloudflare:workers`, KV, Durable Object, D1, R2, and service-binding
types anywhere outside Cloudflare adapters and composition roots. The same
domain tests must run against Cloudflare and Node/MongoDB adapters.

### Sibling-workspace dependencies

Reject `../` workspace dependencies such as the reference's WorkKit inclusion.
Owned UI packages must be part of this repository or consumed as published,
versioned dependencies so a clean checkout is self-contained.

### UI-only authorization and client-only shells

Reject UI gating as a security boundary. Also avoid defaulting every console
route to `client:only="react"`; render useful static/shell state and hydrate only
the behavior that needs it.

### Generic workflow and model platforms

Do not add model routing, agent planning/memory, RAG/vector storage, or a general
workflow builder. Triggers and approvals are integration control primitives,
not a new automation product.

## Product-research decisions

The research conclusion that generic aggregation is commoditized is accepted
([S-040]–[S-047]). The product leads with governed composition, portable
identity/credentials, and inspectable reliability. The following research
proposals are adapted:

- Open safety controls and portability are retained ([S-036], [S-037]).
- Connector quality is proved by immutable builds, provenance, SBOMs, and named
  compatibility tests rather than catalog count ([S-038], [S-039]).
- Configuration and connection metadata export is guaranteed; vendor-owned
  OAuth grants may require re-consent and must never be advertised as silently
  portable ([S-027], [S-028]).
- Edge/stable/LTS release discipline is retained, but the paid value is support
  for those open releases rather than gated binaries.
- The `liteMCP` name is treated as a requested repository name, not a cleared
  public trademark ([S-050], [S-051]).

## Revisit triggers

Create or update an ADR if any of these becomes true:

- KV projections cannot meet measured discovery latency without weakening
  revocation semantics;
- organization-scoped Durable Objects create an unacceptable contention limit;
- MongoDB cannot reproduce required cloud semantics or operational simplicity;
- Better Auth cannot meet open-source SSO, air-gap, or adapter requirements;
- a standard MCP policy or registry extension supersedes the local schema;
- the same core runtime cannot pass a shared conformance suite on Workers and
  Node;
- an infrastructure change is needed for a measured scale or reliability
  target rather than anticipated complexity.
