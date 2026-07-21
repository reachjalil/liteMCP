# Pattern audit

Status: complete as a documentation audit on 2026-07-21. It is not an audit of
LiteMCP Composer implementation code because the target workspace contained no
application code when inspected.

## Inputs

| Input | Role | Availability | Notes |
| --- | --- | --- | --- |
| This repository | Target workspace | Available | Initially contained only the research package; no existing build, test, lint, deployment, or application conventions were available to preserve |
| Sibling `workspaces-hub` workspace | Code and product-pattern reference | Available | Primary source for pnpm/Turbo, Astro, Hono, React island, Cloudflare, UI, test, and packaging patterns |
| `deep-dive-research-litellm-litemcp-business-model` | Product and business research | Available | 34 numbered reports, structured data, diagrams, and a 56-source evidence ledger |
| User-supplied implementation brief | Authoritative product contract | Available | Supersedes conflicting research proposals, particularly licensing and monetization |

The research evidence keys cited below resolve through the
[`evidence ledger`](../deep-dive-research-litellm-litemcp-business-model/19-evidence-ledger.md).

## Pattern matrix

| Area | Observed reference pattern | Assessment for LiteMCP Composer |
| --- | --- | --- |
| Workspace | pnpm 10.30.2, Node >=22.12, ESM, Turbo, centralized pnpm catalog, `workspace:*` internal dependencies | Adopt and keep the new repository independently buildable |
| TypeScript | Strict root configuration, but some applications locally disable `strict`, `strictNullChecks`, and `noImplicitAny` | Adopt the root discipline; reject app-level weakening |
| Formatting/lint | Biome; two spaces, double quotes, semicolons, approximately 80-column target | Adopt, while re-enabling meaningful accessibility checks disabled in the reference |
| Package boundaries | Deployable apps compose focused packages; explicit subpath exports; relative imports inside packages | Adopt; keep shared domain behavior out of app-local utilities |
| Runtime APIs | Typed Hono bindings, Web `Request`/`Response`, Web Crypto, Zod at runtime boundaries | Adopt and extend with generated OpenAPI, request IDs, versioned error envelopes, and central authz middleware |
| Astro | Astro server output with Cloudflare adapter and React integration; catch-all API bridge to Hono | Adapt to Astro static site/console output with React islands and separate portable Hono services |
| React | Rich islands commonly use `client:only="react"` | Use selectively; render the shell and initial data where possible to avoid hydration and session-fetch waterfalls |
| UI composition | Dense workbench shell, registered side panels, tabs, inspector, compact rails, persisted panel state | Adopt for the console, replacing editor/drawing concepts with MCP resources and operations |
| Visual system | Sharp surfaces, zero-radius editor regions, restrained shadows, Geist/Geist Mono, semantic OKLCH tokens, light/dark modes, Tailwind 4, Base UI-backed primitives | Adopt the visual language and accessibility intent; vendor or publish owned UI packages rather than importing a sibling workspace |
| Authentication | Better Auth created per environment/request; trusted origins; development bypass restricted to local mode and localhost; explicit migrations | Adopt the integration shape, not the limited social-login/email-allowlist authorization model |
| Enterprise identity | Reference lacks tenant IdPs, OIDC/SAML enterprise SSO, SCIM, group mapping, service accounts, scoped API keys, and tenant RBAC/ABAC | Build as first-class open product capabilities; do not infer them from Better Auth login |
| Credential storage | Reference AES helper derives one key from one static secret and lacks key ID, rotation, envelope encryption, and AAD | Reject; require tenant-bound envelope encryption and pluggable Vault/KMS custody |
| Cloudflare data | D1 for auth/business data, KV for workspace metadata, Durable Object SQLite for stateful agents/usage | Adapt behind `DocumentStore` and `AuthStore` ports |
| KV mutation | Workspace metadata, membership, and user index are separate KV writes | Reject for security-critical state; partial writes and eventual consistency are unsafe |
| Durable state | Usage ledger demonstrates useful idempotency; mutation-journal/outbox design is documented | Adopt idempotency and journal/outbox concepts; add explicit mutation serialization |
| Service authentication | Signed short-lived claims and scoped service bindings | Adapt; bind audience, route, method, body digest, expiry, and nonce, and prevent replay |
| Errors/API | Routers are typed but lack a uniform versioned envelope, request IDs, OpenAPI, rate limits, and central policy handling | Improve from the first endpoint |
| Tests | Vitest, Cloudflare Vitest pool, Playwright across browsers, traces/screenshots/video, bundle budgets, performance baselines | Adopt; add protocol conformance, tenant isolation, auth, migration, container, Helm, and portability coverage |
| CI | Strong isolated package workflow, but no complete repository/app CI; some E2E/performance checks are unwired | Reject partial coverage; every supported app and deployment is a required root check |
| Packaging | Explicit `files`, dist-only exports, metadata, `prepack`, tarball smoke test, dependency audit, npm provenance, Changesets | Adopt for publishable SDK, CLI, connector SDK, and UI packages |
| Repository self-containment | Reference workspace includes `../repos/work-kit/packages/*` | Reject; a clean clone must build without sibling directories |
| Containers/Kubernetes | No Dockerfiles, Compose, Helm, Kubernetes, or Terraform patterns present | No pattern to adopt; implement portable OCI/Compose/Helm practices from the product requirements |
| Open-source governance | Reference root is private-oriented and lacks a complete public-project legal/governance surface | Add Apache-2.0, notices, contributing, security, conduct, governance, release, and trademark guidance |

## Research conclusions carried forward

- Aggregation and a single MCP endpoint are necessary but already crowded.
  Differentiation must be managed authentication, portable credentials,
  deterministic policy, compatibility evidence, and connector reliability
  ([S-040]–[S-047]).
- MCP proxy security is baseline functionality, not an enterprise gate:
  audience validation, confused-deputy controls, SSRF defenses, encrypted local
  secrets, export, audit, and telemetry remain open ([S-036], [S-037]).
- Composio demonstrates the value of per-user connected accounts and hosted MCP
  sessions, but the reviewed open repository is an SDK for a hosted backend,
  not a complete self-hosted platform ([S-027]–[S-032]).
- The official registry is an index, not a security certification. LiteMCP Composer must
  distinguish publication from reproducible compatibility and provenance
  evidence ([S-038], [S-039]).
- Existing `litemcp` package and repository names create a launch-name collision
  risk ([S-050], [S-051]).
- The research had no live product trials or archived snapshots. Its market,
  onboarding, pricing, and economics conclusions remain hypotheses, as recorded
  in its quality review.

## Conflicts requiring an explicit decision

| Conflict | Research/reference position | Authoritative LiteMCP Composer decision |
| --- | --- | --- |
| Commercial boundary | Research proposes paid cloud tiers and paid enterprise features | Managed cloud and self-hosted software are free; no feature gates or checkout; contracts sell operational service and accountability |
| Database | Research defaults to PostgreSQL source of truth; reference mixes D1, KV, and Durable Objects | Product state uses a portable NoSQL `DocumentStore`: KV MVP plus Durable Object serialization on Cloudflare, MongoDB replica set on Kubernetes; Better Auth uses D1/MongoDB separately |
| Web delivery | Reference favors Astro server output for Cloudflare applications | Public site and console use Astro static output plus React islands; Hono is a separate portable API/runtime boundary |
| Policy technology | Research suggests OPA when no repository pattern exists | Use a typed, deterministic, open policy schema/evaluator that runs identically in Workers and Node; leave a policy-engine adapter seam |
| Scope sequencing | Research recommends validating the wedge before a broad build | Implement a thin, real vertical slice first and label all further capability honestly; repository scaffolding is not product completion |

## Missing or weak patterns

The reference does not establish production conventions for MongoDB schema and
index migration, Kubernetes operations, air-gapped delivery, MCP conformance,
SCIM, SAML, credential envelope encryption, signed artifacts, or multi-tenant
policy evaluation. These require project ADRs and tests before they become
conventions.

## Files inspected most closely

- `workspaces-hub/package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `tsconfig.base.json`, and `biome.json`;
- Toolbox and Workspaces Studio workbench shells, registration types, islands,
  styles, Astro configuration, Hono roots, and Worker entrypoints;
- Better Auth server setup and migrations in Workspaces Studio, Toolbox, and
  Watch Tower;
- worker service-auth and workspace-access packages;
- KV workspace access, Durable Object usage ledger, and mutation-journal design;
- Workspaces Studio Playwright/performance assets;
- Skills Kit package metadata, smoke/audit scripts, Changesets, and publish CI.

This audit records transferable patterns, not permission to copy private names,
credentials, endpoints, branding, generated artifacts, or incompatible code.
